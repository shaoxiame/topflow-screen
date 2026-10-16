/*
 * html_view.cpp - render an HTML/CSS page to the RGB565 framebuffer using
 * litehtml (layout/CSS) + FreeType (text). devui becomes a thin HTML shell:
 * the UI is authored in ui/index.html, this draws it.
 *
 * No JavaScript; CSS grid is unsupported by litehtml (falls back to block).
 *
 * SPDX-License-Identifier: MIT
 */
#include <litehtml.h>

#include <ft2build.h>
#include FT_FREETYPE_H
#include FT_OUTLINE_H

#include <cstdint>
#include <cstddef>
#include <cmath>
#include <cstdio>
#include <cstring>
#include <string>
#include <vector>
#include <algorithm>
#include <sys/stat.h>

using namespace litehtml;

/* ---- target framebuffer (shared with drm_disp, 180° rotated panel) ---- */
static uint16_t *g_fb;
static int g_w, g_h, g_pitch_px, g_rotate = 1;
static int g_clip_top = 0;
static int g_paint_top = 0, g_paint_bottom = 0; /* temporary document band */

static inline void put_px(int x, int y, int r, int g, int b, int a)
{
    if (y < g_clip_top) return;
    if (x < 0 || y < 0 || x >= g_w || y >= g_h || a <= 0) return;
    int dx = g_rotate ? (g_w - 1 - x) : x;
    int dy = g_rotate ? (g_h - 1 - y) : y;
    uint16_t *p = &g_fb[dy * g_pitch_px + dx];
    if (a < 255) {
        uint16_t o = *p;
        int rv=(o >> 11) & 31, gv=(o >> 5) & 63, bv=o & 31;
        int orr=(rv << 3) | (rv >> 2), og=(gv << 2) | (gv >> 4), ob=(bv << 3) | (bv >> 2);
        r = (r * a + orr * (255 - a)) / 255;
        g = (g * a + og * (255 - a)) / 255;
        b = (b * a + ob * (255 - a)) / 255;
    }
    *p = (uint16_t)(((r & 0xF8) << 8) | ((g & 0xFC) << 3) | (b >> 3));
}

static inline uint16_t get_px565(int x, int y)
{
    if (x < 0 || y < 0 || x >= g_w || y >= g_h || !g_fb) return 0;
    int dx = g_rotate ? (g_w - 1 - x) : x;
    int dy = g_rotate ? (g_h - 1 - y) : y;
    return g_fb[dy * g_pitch_px + dx];
}

/* Subpixel coverage only at rounded edges; interior pixels take the cheap
 * opaque path. The 4x4 sample grid is spatial and fixed, not a larger render
 * target or a temporal effect. It removes the binary stair-steps on cards,
 * toggles and icons without changing framebuffer size or adding redraws. */
static int rounded_coverage(int x, int y, int fx, int fy, int fw, int fh,
                            int rtl, int rtr, int rbr, int rbl)
{
    if (fw <= 0 || fh <= 0 || x < fx || y < fy || x >= fx+fw || y >= fy+fh) return 0;
    int r=0,cx=0,cy=0;
    if      (x < fx+rtl && y < fy+rtl) {r=rtl;cx=fx+rtl;cy=fy+rtl;}
    else if (x >= fx+fw-rtr && y < fy+rtr) {r=rtr;cx=fx+fw-rtr;cy=fy+rtr;}
    else if (x >= fx+fw-rbr && y >= fy+fh-rbr) {r=rbr;cx=fx+fw-rbr;cy=fy+fh-rbr;}
    else if (x < fx+rbl && y >= fy+fh-rbl) {r=rbl;cx=fx+rbl;cy=fy+fh-rbl;}
    if (!r) return 255;
    int dx=(x-cx)*8+4,dy=(y-cy)*8+4,rr=r*8;
    int d2=dx*dx+dy*dy;
    if (d2 <= (rr-6)*(rr-6)) return 255;
    if (d2 >= (rr+6)*(rr+6)) return 0;
    int count=0;
    for(int sy=1;sy<8;sy+=2) for(int sx=1;sx<8;sx+=2) {
        int ax=(x-cx)*8+sx,ay=(y-cy)*8+sy;
        count += ax*ax+ay*ay <= rr*rr;
    }
    return (count*255+8)/16;
}

/* ---- FreeType ---- */
static FT_Library g_ft;
static FT_Face    g_face;

struct ft_font { int size, bold; int ascent, descent, height; };

/* The screen has a small, repeating vocabulary. Keep glyph metrics/coverage
 * across paints without retaining an unbounded set of messages or fonts.
 * Direct-mapped slots avoid heap-backed lookup tables and expensive scans. */
static constexpr unsigned GLYPH_SLOTS = 512;
static constexpr size_t GLYPH_BYTES_LIMIT = 384 * 1024;
struct cached_glyph {
    unsigned cp = 0;
    int size = 0, strength = 0, advance = 0, render_advance = 0;
    int left = 0, top = 0, width = 0, rows = 0;
    bool valid = false, rendered = false;
    std::vector<unsigned char> pixels;
};
static cached_glyph g_glyphs[GLYPH_SLOTS];
static size_t g_glyph_bytes;
static unsigned g_glyph_evict;
static int g_font_size;
/* The factory rounded font has no TrueType fpgm/cvt hinting tables. Native
 * outline loading left small strokes between physical pixels, especially at
 * 9--13 px. Grid-fit its outlines at the panel's real pixel size; grayscale
 * coverage still preserves diagonals. No subpixel RGB assumptions, scaling,
 * supersampling or per-frame work: the result uses the bounded glyph cache. */
static constexpr FT_Int32 GLYPH_LOAD_FLAGS =
    FT_LOAD_FORCE_AUTOHINT | FT_LOAD_TARGET_NORMAL | FT_LOAD_NO_BITMAP;
static void glyph_clear(cached_glyph &g) {
    g_glyph_bytes -= g.pixels.capacity();
    std::vector<unsigned char>().swap(g.pixels);
    g.valid = g.rendered = false;
}
static void glyph_cache_clear() {
    for (auto &g : g_glyphs) glyph_clear(g);
    g_glyph_evict = 0; g_font_size = 0;
}
static bool set_font_size_cached(int size) {
    if (!g_face || size <= 0) return false;
    if (g_font_size == size) return true;
    if (FT_Set_Pixel_Sizes(g_face, 0, size)) return false;
    g_font_size = size; return true;
}
/* 26.6-pixel outline weights, applied once while a glyph is cached. A full
 * 1px bitmap dilation almost doubled narrow strokes at 11-14px and closed
 * counters. Fractional outline weight keeps native grayscale edge coverage. */
static int font_strength(int css_weight) {
    return css_weight >= 700 ? 32 : css_weight >= 600 ? 20 : 0;
}
static cached_glyph *glyph_get(unsigned cp, int size, bool render, int strength = 0) {
    if (!set_font_size_cached(size)) return nullptr;
    unsigned slot = ((cp * 2654435761u) ^ ((unsigned)size * 2246822519u) ^ ((unsigned)strength * 3266489917u)) & (GLYPH_SLOTS - 1);
    cached_glyph &g = g_glyphs[slot];
    if (!g.valid || g.cp != cp || g.size != size || g.strength != strength) {
        glyph_clear(g);
        if (FT_Load_Char(g_face, cp, GLYPH_LOAD_FLAGS)) return nullptr;
        g.cp = cp; g.size = size; g.strength = strength; g.advance = (g_face->glyph->advance.x + strength + 32) >> 6; g.valid = true;
    }
    if (!render || g.rendered) return &g;
    if (FT_Load_Char(g_face, cp, GLYPH_LOAD_FLAGS)) return nullptr;
    FT_GlyphSlot gl = g_face->glyph;
    if (strength && gl->format == FT_GLYPH_FORMAT_OUTLINE &&
        FT_Outline_EmboldenXY(&gl->outline, strength, strength)) return nullptr;
    if (FT_Render_Glyph(gl, FT_RENDER_MODE_NORMAL)) return nullptr;
    const FT_Bitmap &bm = gl->bitmap;
    /* Fail closed on malformed/unbounded bitmaps. Production fonts are small
     * grayscale glyphs; empty glyphs (spaces) are valid and still advance. */
    if (bm.width > 256 || bm.rows > 256 || (bm.width && bm.rows &&
        (!bm.buffer || std::abs(bm.pitch) < (int)bm.width || bm.pixel_mode != FT_PIXEL_MODE_GRAY))) return nullptr;
    size_t bytes = (size_t)bm.width * bm.rows;
    while (g_glyph_bytes + bytes > GLYPH_BYTES_LIMIT) {
        unsigned victim = g_glyph_evict++ & (GLYPH_SLOTS - 1);
        if (victim != slot) glyph_clear(g_glyphs[victim]);
    }
    g.pixels.resize(bytes);
    if (g.pixels.capacity() > GLYPH_BYTES_LIMIT) {
        std::vector<unsigned char>().swap(g.pixels); g.valid = false; return nullptr;
    }
    while (g_glyph_bytes + g.pixels.capacity() > GLYPH_BYTES_LIMIT) {
        unsigned victim = g_glyph_evict++ & (GLYPH_SLOTS - 1);
        if (victim != slot) glyph_clear(g_glyphs[victim]);
    }
    for (unsigned row = 0; row < bm.rows; row++)
        if (bm.width) memcpy(g.pixels.data() + row * bm.width, bm.buffer + (std::ptrdiff_t)row * bm.pitch, bm.width);
    g_glyph_bytes += g.pixels.capacity();
    g.left = gl->bitmap_left; g.top = gl->bitmap_top;
    g.width = bm.width; g.rows = bm.rows; g.render_advance = (gl->advance.x + strength + 32) >> 6;
    g.rendered = true; return &g;
}
#ifdef TF_RENDER_TEST
extern "C" size_t html_view_test_cache_bytes(void) { return g_glyph_bytes; }
extern "C" unsigned html_view_test_cache_entries(void) {
    unsigned count = 0; for (const auto &g : g_glyphs) if (g.valid) count++; return count;
}
#endif

/* UI base dir (for <link> CSS / images) and last-clicked anchor href. */
static std::string g_ui_dir = "/data/plugins/u60pro-devui/ui";
static std::string g_clicked;

static long long css_file_mtime_ns(const std::string &path)
{
    struct stat st;
    if (stat(path.c_str(), &st) != 0) return -1;
#ifdef _WIN32
    return (long long)st.st_mtime * 1000000000LL;
#else
    return (long long)st.st_mtime * 1000000000LL + (long long)st.st_mtim.tv_nsec;
#endif
}

struct css_cache_entry {
    std::string path;
    std::string text;
    long long mtime = -1;
    bool used = false;
};

static css_cache_entry g_css_cache[4];
static int g_css_cache_next;

static int read_file_text(const char *path, std::string &out)
{
    FILE *f = fopen(path, "rb");
    if (!f) return 0;
    long n;
    int ok = 0;
    if (fseek(f, 0, SEEK_END) == 0) {
        n = ftell(f);
        if (n >= 0 && n <= 262144) {
            if (n > 0) {
                out.resize((size_t)n);
                fseek(f, 0, SEEK_SET);
                ok = (fread(&out[0], 1, (size_t)n, f) == (size_t)n);
            } else {
                out.clear();
                ok = 1;
            }
        }
    }
    fclose(f);
    if (!ok) out.clear();
    return ok;
}

static void css_get_cached(std::string &out, const std::string &path)
{
    long long mtime = css_file_mtime_ns(path);
    if (mtime < 0) return;

    for (int i = 0; i < 4; i++) {
        css_cache_entry &e = g_css_cache[i];
        if (!e.used || e.path != path) continue;
        if (e.mtime == mtime && !e.text.empty()) {
            out = e.text;
            return;
        }
        if (read_file_text(path.c_str(), e.text)) {
            e.mtime = mtime;
            out = e.text;
            return;
        }
        out = e.text;
        return;
    }

    css_cache_entry *e = nullptr;
    for (int i = 0; i < 4; i++) {
        if (!g_css_cache[i].used) { e = &g_css_cache[i]; break; }
    }
    if (!e) {
        e = &g_css_cache[g_css_cache_next];
        g_css_cache_next = (g_css_cache_next + 1) % 4;
    }
    std::string next;
    if (!read_file_text(path.c_str(), next)) return;
    e->path = path;
    e->text = std::move(next);
    e->mtime = mtime;
    e->used = true;
    out = e->text;
}

static unsigned utf8_next(const char *&s)
{
    unsigned c = (unsigned char)*s++;
    if (c < 0x80) return c;
    int n = (c >= 0xF0) ? 3 : (c >= 0xE0) ? 2 : 1;
    c &= (0x3F >> n);
    while (n-- && (*s & 0xC0) == 0x80) c = (c << 6) | (*s++ & 0x3F);
    return c;
}

/* ---- container ---- */
class fb_container : public document_container {
    std::vector<position> m_clip;

    position eff_clip() const {
        int top = std::max(g_clip_top, g_paint_top);
        int bottom = g_paint_bottom > 0 ? std::min(g_h, g_paint_bottom) : g_h;
        position r(0, (pixel_t)top, (pixel_t)g_w, (pixel_t)std::max(0, bottom - top));
        for (auto &c : m_clip) {
            pixel_t x1 = std::max(r.left(), c.left()), y1 = std::max(r.top(), c.top());
            pixel_t x2 = std::min(r.right(), c.right()), y2 = std::min(r.bottom(), c.bottom());
            r = position(x1, y1, std::max<pixel_t>(0, x2 - x1), std::max<pixel_t>(0, y2 - y1));
        }
        return r;
    }
    void fill(pixel_t fx, pixel_t fy, pixel_t fw, pixel_t fh, web_color c) {
        if (c.alpha == 0) return;
        position cl = eff_clip();
        int x1 = std::max((int)fx, (int)cl.left()),  y1 = std::max((int)fy, (int)cl.top());
        int x2 = std::min((int)(fx + fw), (int)cl.right()), y2 = std::min((int)(fy + fh), (int)cl.bottom());
        for (int y = y1; y < y2; y++)
            for (int x = x1; x < x2; x++)
                put_px(x, y, c.red, c.green, c.blue, c.alpha);
    }
    /* Filled rectangle with rounded corners. litehtml only hands us the radii;
     * it's up to the container to honor them, so a pixel inside one of the four
     * corner squares but outside its quarter-circle arc is skipped. */
    void fill_rounded(int fx, int fy, int fw, int fh, int rtl, int rtr, int rbr, int rbl, web_color c) {
        if (c.alpha == 0 || fw <= 0 || fh <= 0) return;
        int hw = fw / 2, hh = fh / 2;
        if (rtl > hw) rtl = hw; if (rtl > hh) rtl = hh;
        if (rtr > hw) rtr = hw; if (rtr > hh) rtr = hh;
        if (rbr > hw) rbr = hw; if (rbr > hh) rbr = hh;
        if (rbl > hw) rbl = hw; if (rbl > hh) rbl = hh;
        position cl = eff_clip();
        int x1 = std::max(fx, (int)cl.left()),  y1 = std::max(fy, (int)cl.top());
        int x2 = std::min(fx + fw, (int)cl.right()), y2 = std::min(fy + fh, (int)cl.bottom());
        for (int y = y1; y < y2; y++) {
            int left_edge=fx+(y<fy+rtl?rtl:y>=fy+fh-rbl?rbl:0);
            int right_edge=fx+fw-(y<fy+rtr?rtr:y>=fy+fh-rbr?rbr:0);
            int middle_left=std::min(x2,std::max(x1,left_edge));
            int middle_right=std::max(middle_left,std::min(x2,right_edge));
            for(int x=x1;x<middle_left;x++) {
                int coverage=rounded_coverage(x,y,fx,fy,fw,fh,rtl,rtr,rbr,rbl);
                if(coverage) put_px(x,y,c.red,c.green,c.blue,c.alpha*coverage/255);
            }
            for(int x=middle_left;x<middle_right;x++) put_px(x,y,c.red,c.green,c.blue,c.alpha);
            for(int x=middle_right;x<x2;x++) {
                int coverage=rounded_coverage(x,y,fx,fy,fw,fh,rtl,rtr,rbr,rbl);
                if(coverage) put_px(x,y,c.red,c.green,c.blue,c.alpha*coverage/255);
            }
        }
    }
    /* Stroke a rounded-rect outline of uniform thickness t: a pixel inside the
     * outer rounded rect but outside the inner one (inset by t). */
    void stroke_rounded(int fx, int fy, int fw, int fh, int rtl, int rtr, int rbr, int rbl, int t, web_color c) {
        if (c.alpha == 0 || t <= 0 || fw <= 0 || fh <= 0) return;
        int hw = fw / 2, hh = fh / 2;
        if (rtl > hw) rtl = hw; if (rtl > hh) rtl = hh;
        if (rtr > hw) rtr = hw; if (rtr > hh) rtr = hh;
        if (rbr > hw) rbr = hw; if (rbr > hh) rbr = hh;
        if (rbl > hw) rbl = hw; if (rbl > hh) rbl = hh;
        int itl = rtl - t > 0 ? rtl - t : 0, itr = rtr - t > 0 ? rtr - t : 0;
        int ibr = rbr - t > 0 ? rbr - t : 0, ibl = rbl - t > 0 ? rbl - t : 0;
        position cl = eff_clip();
        int x1 = std::max(fx, (int)cl.left()),  y1 = std::max(fy, (int)cl.top());
        int x2 = std::min(fx + fw, (int)cl.right()), y2 = std::min(fy + fh, (int)cl.bottom());
        for (int y = y1; y < y2; y++)
            for (int x = x1; x < x2; x++)
            {
                int outer=rounded_coverage(x,y,fx,fy,fw,fh,rtl,rtr,rbr,rbl);
                int inner=rounded_coverage(x,y,fx+t,fy+t,fw-2*t,fh-2*t,itl,itr,ibr,ibl);
                int coverage=std::max(0,outer-inner);
                if (coverage) put_px(x,y,c.red,c.green,c.blue,c.alpha*coverage/255);
            }
    }

    void fill_background_box(const background_layer &layer, web_color c) {
        const position &b = layer.border_box;
        const border_radiuses &br = layer.border_radius;
        if (br.top_left_x > 0 || br.top_right_x > 0 || br.bottom_right_x > 0 || br.bottom_left_x > 0)
            fill_rounded(b.x, b.y, b.width, b.height,
                         (int)br.top_left_x, (int)br.top_right_x,
                         (int)br.bottom_right_x, (int)br.bottom_left_x, c);
        else
            fill(b.x, b.y, b.width, b.height, c);
    }

public:
    uint_ptr create_font(const font_description &d, const document *, font_metrics *fm) override {
        auto *f = new ft_font();
        f->size = (int)d.size;
        f->bold = font_strength(d.weight);
        set_font_size_cached(f->size);
        f->ascent  = g_face->size->metrics.ascender >> 6;
        f->descent = -(g_face->size->metrics.descender >> 6);
        f->height  = g_face->size->metrics.height >> 6;
        if (fm) {
            fm->font_size = d.size;
            fm->ascent = f->ascent; fm->descent = f->descent;
            fm->height = f->height ? f->height : f->size;
            fm->x_height = f->size / 2; fm->ch_width = f->size / 2;
            fm->draw_spaces = true;
        }
        return (uint_ptr)f;
    }
    void delete_font(uint_ptr h) override { delete (ft_font *)h; }

    pixel_t text_width(const char *text, uint_ptr h) override {
        auto *f = (ft_font *)h;
        pixel_t w = 0;
        for (const char *s = text; *s; ) {
            unsigned cp = utf8_next(s);
            cached_glyph *gl = glyph_get(cp, f->size, false, f->bold);
            if (!gl) continue;
            w += gl->advance;
        }
        return w;
    }

    void draw_text(uint_ptr, const char *text, uint_ptr h, web_color color, const position &pos) override {
        auto *f = (ft_font *)h;
        int pen = (int)pos.x;
        int base = (int)pos.y + f->ascent;
        position cl = eff_clip();
        /* Text boxes can contain glyphs beyond their nominal line height.
         * A generous face-sized margin culls wholly invisible lines without
         * truncating accents/descenders in the shipped font. */
        if (!color.alpha || cl.width <= 0 || cl.height <= 0 ||
            base + f->size * 2 < cl.top() || base - f->size * 2 >= cl.bottom()) return;
        for (const char *s = text; *s; ) {
            if (pen - f->size * 2 >= cl.right()) break;
            unsigned cp = utf8_next(s);
            cached_glyph *gl = glyph_get(cp, f->size, true, f->bold);
            if (!gl) continue;
            int ox = pen + gl->left, oy = base - gl->top;
            int r1 = std::max(0, (int)cl.top() - oy), r2 = std::min(gl->rows, (int)cl.bottom() - oy);
            int c1 = std::max(0, (int)cl.left() - ox), c2 = std::min(gl->width, (int)cl.right() - ox);
            for (int r = r1; r < r2; r++) {
                int yy = oy + r;
                for (int cx = c1; cx < c2; cx++) {
                    int a = gl->pixels[r * gl->width + cx];
                    if (a) put_px(ox + cx, yy, color.red, color.green, color.blue, a * color.alpha / 255);
                }
            }
            pen += gl->render_advance;
        }
    }

    pixel_t pt_to_px(float pt) const override { return (pixel_t)(pt * 96.0f / 72.0f + 0.5f); }
    pixel_t get_default_font_size() const override { return 16; }
    const char *get_default_font_name() const override { return "sans-serif"; }

    void draw_solid_fill(uint_ptr, const background_layer &layer, const web_color &color) override {
        fill_background_box(layer, color);
    }
    /* CSS linear gradient stops are already normalized by litehtml. */
    void draw_linear_gradient(uint_ptr, const background_layer &l, const background_layer::linear_gradient &g) override {
        if (g.color_points.empty()) return;
        const position &b=l.border_box, cl=eff_clip();const auto &br=l.border_radius;
        int x1=std::max({(int)b.left(),(int)cl.left(),(int)l.clip_box.left()}),x2=std::min({(int)b.right(),(int)cl.right(),(int)l.clip_box.right()});
        int y1=std::max({(int)b.top(),(int)cl.top(),(int)l.clip_box.top()}),y2=std::min({(int)b.bottom(),(int)cl.bottom(),(int)l.clip_box.bottom()});
        double dx=g.end.x-g.start.x,dy=g.end.y-g.start.y,den=dx*dx+dy*dy;
        for(int y=y1;y<y2;y++)for(int x=x1;x<x2;x++){
            int coverage=rounded_coverage(x,y,(int)b.x,(int)b.y,(int)b.width,(int)b.height,(int)br.top_left_x,(int)br.top_right_x,(int)br.bottom_right_x,(int)br.bottom_left_x);if(!coverage)continue;
            double t=den>0?((x+.5-g.start.x)*dx+(y+.5-g.start.y)*dy)/den:0;
            size_t k=1;while(k<g.color_points.size()&&t>g.color_points[k].offset)k++;
            const auto &a=g.color_points[k?k-1:0],&z=g.color_points[std::min(k,g.color_points.size()-1)];
            double span=z.offset-a.offset,u=span>0?std::max(0.0,std::min(1.0,(t-a.offset)/span)):0;
            /* Fixed ordered dithering softens RGB565 bands without temporal
             * noise or any additional redraw. Average color stays unchanged. */
            static const unsigned char bayer[4][4]={{0,8,2,10},{12,4,14,6},{3,11,1,9},{15,7,13,5}};
            double d=(bayer[y&3][x&3]+.5)/16.0-.5;
            auto channel=[&](double value,double quantum){return (int)std::max(0.0,std::min(255.0,value+d*quantum+.5));};
            put_px(x,y,channel(a.color.red+(z.color.red-a.color.red)*u,8),channel(a.color.green+(z.color.green-a.color.green)*u,4),channel(a.color.blue+(z.color.blue-a.color.blue)*u,8),(int)(a.color.alpha+(z.color.alpha-a.color.alpha)*u+.5)*coverage/255);
        }
    }
    void draw_radial_gradient(uint_ptr, const background_layer &l, const background_layer::radial_gradient &) override {
        fill_background_box(l, web_color(45, 46, 50));
    }
    void draw_conic_gradient(uint_ptr, const background_layer &l, const background_layer::conic_gradient &) override {
        fill_background_box(l, web_color(45, 46, 50));
    }

    void draw_borders(uint_ptr, const borders &b, const position &p, bool) override {
        /* Rounded outline for the common case: all four sides equal width, same
         * color, with a corner radius (cards, the battery frame, ...). */
        int rtl = (int)b.radius.top_left_x, rtr = (int)b.radius.top_right_x;
        int rbr = (int)b.radius.bottom_right_x, rbl = (int)b.radius.bottom_left_x;
        const web_color &tc = b.top.color;
        bool same_w = b.top.width == b.left.width && b.top.width == b.right.width && b.top.width == b.bottom.width;
        bool same_c = tc.red == b.left.color.red && tc.green == b.left.color.green && tc.blue == b.left.color.blue && tc.alpha == b.left.color.alpha
                   && tc.red == b.right.color.red && tc.green == b.right.color.green && tc.blue == b.right.color.blue && tc.alpha == b.right.color.alpha
                   && tc.red == b.bottom.color.red && tc.green == b.bottom.color.green && tc.blue == b.bottom.color.blue && tc.alpha == b.bottom.color.alpha;
        bool all_solid = b.top.style != border_style_none && b.left.style != border_style_none
                      && b.right.style != border_style_none && b.bottom.style != border_style_none;
        if ((rtl || rtr || rbr || rbl) && same_w && same_c && all_solid && b.top.width > 0) {
            stroke_rounded(p.x, p.y, p.width, p.height, rtl, rtr, rbr, rbl, b.top.width, tc);
            return;
        }
        if (b.top.width > 0    && b.top.style    != border_style_none) fill(p.x, p.y, p.width, b.top.width, b.top.color);
        if (b.bottom.width > 0 && b.bottom.style != border_style_none) fill(p.x, p.bottom() - b.bottom.width, p.width, b.bottom.width, b.bottom.color);
        if (b.left.width > 0   && b.left.style   != border_style_none) fill(p.x, p.y, b.left.width, p.height, b.left.color);
        if (b.right.width > 0  && b.right.style  != border_style_none) fill(p.right() - b.right.width, p.y, b.right.width, p.height, b.right.color);
    }

    void draw_list_marker(uint_ptr, const list_marker &) override {}

    /* images: not supported (the example uses none) */
    void load_image(const char *, const char *, bool) override {}
    void get_image_size(const char *, const char *, size &sz) override { sz.width = sz.height = 0; }
    void draw_image(uint_ptr, const background_layer &, const std::string &, const std::string &) override {}

    void set_clip(const position &pos, const border_radiuses &) override { m_clip.push_back(pos); }
    void del_clip() override { if (!m_clip.empty()) m_clip.pop_back(); }
    void reset_state() { m_clip.clear(); }

    void get_viewport(position &v) const override { v = position(0, 0, (pixel_t)g_w, (pixel_t)g_h); }
    void get_media_features(media_features &m) const override {
        m.type = media_type_screen;
        m.width = m.device_width = (pixel_t)g_w;
        m.height = m.device_height = (pixel_t)g_h;
        m.color = 8; m.resolution = 96;
    }
    void get_language(string &, string &) const override {}

    /* trivial stubs */
    void set_caption(const char *) override {}
    void set_base_url(const char *) override {}
    void link(const std::shared_ptr<document> &, const element::ptr &) override {}
    void on_anchor_click(const char *url, const element::ptr &) override { g_clicked = url ? url : ""; }
    void on_mouse_event(const element::ptr &, mouse_event) override {}
    void set_cursor(const char *) override {}
    void transform_text(string &, text_transform) override {}
    void import_css(string &text, const string &url, string &) override {
        std::string path = g_ui_dir + "/" + url;
        css_get_cached(text, path);
    }
    element::ptr create_element(const char *, const string_map &, const std::shared_ptr<document> &) override { return nullptr; }
};

/* ---- C interface for the (C) main harness ---- */
static fb_container   *g_container;
static document::ptr   g_doc;
static int             g_scroll_y;   /* vertical scroll offset (logical px) */
static int             g_doc_overlay; /* overlay docs are already in screen coords */
static int             g_doc_w, g_doc_h;
static std::string     g_doc_uidir;
static int             g_pinned_height;
static uint16_t        g_pinned_pixels[320 * 96];
static element::ptr    g_pinned_top, g_pinned_title;

static void discard_document() {
    g_doc.reset(); g_pinned_top.reset(); g_pinned_title.reset();
    g_pinned_height = 0; g_doc_w = g_doc_h = 0; g_doc_overlay = 0;
    g_doc_uidir.clear(); g_clicked.clear(); g_paint_top = g_paint_bottom = 0;
}
static void detect_pinned_header() {
    g_pinned_height = 0; g_pinned_top.reset(); g_pinned_title.reset();
    if (!g_doc || g_doc_overlay || g_w > 320) return;
    element::ptr root = g_doc->root(); if (!root) return;
    element::ptr top = root->select_one(".top"), title = root->select_one(".titlebar");
    if (!top || !title) return;
    position a = top->get_placement(), b = title->get_placement();
    int end = (int)b.bottom();
    if ((int)a.y != 0 || a.height <= 0 || b.height <= 0 || (int)b.y != (int)a.bottom() || end > 96 || end >= g_h) return;
    g_pinned_height = end; g_pinned_top = top; g_pinned_title = title;
}
static bool pinned_element(element::ptr el) {
    for (; el; el = el->parent()) if (el == g_pinned_top || el == g_pinned_title) return true;
    return false;
}
static int document_height() {
    element::ptr root = g_doc->root();
    return root ? (int)root->get_placement().height : g_h;
}
static void draw_band(int top, int bottom, int scroll) {
    if (bottom <= top) return;
    g_container->reset_state(); g_paint_top = top; g_paint_bottom = bottom;
    position clip(0, (pixel_t)top, (pixel_t)g_w, (pixel_t)(bottom - top));
    g_doc->draw((uint_ptr)0, 0, -scroll, &clip);
    g_container->reset_state(); g_paint_top = g_paint_bottom = 0;
}
static void draw_document(bool fresh) {
    std::fill(g_fb, g_fb + (size_t)g_pitch_px * g_h, (uint16_t)0);
    if (g_pinned_height && fresh) {
        draw_band(0, g_pinned_height, 0);
        for (int y = 0; y < g_pinned_height; y++) for (int x = 0; x < g_w; x++)
            g_pinned_pixels[y * g_w + x] = get_px565(x, y);
    }
    draw_band(g_pinned_height, g_h, g_scroll_y);
    if (g_pinned_height && !fresh) {
        for (int y = 0; y < g_pinned_height; y++) for (int x = 0; x < g_w; x++) {
            int dx = g_rotate ? g_w - 1 - x : x, dy = g_rotate ? g_h - 1 - y : y;
            g_fb[dy * g_pitch_px + dx] = g_pinned_pixels[y * g_w + x];
        }
    }
}

extern "C" void html_view_init(uint16_t *fb, int w, int h, int pitch_px, int rotate, const char *font_path)
{
    discard_document();
    delete g_container; g_container = nullptr;
    glyph_cache_clear();
    if (g_face) FT_Done_Face(g_face);
    if (g_ft) FT_Done_FreeType(g_ft);
    g_face = nullptr; g_ft = nullptr; g_clip_top = 0; g_scroll_y = 0;
    g_fb = fb; g_w = w; g_h = h; g_pitch_px = pitch_px; g_rotate = rotate;
    if (!fb || w <= 0 || h <= 0 || pitch_px < w || !font_path) return;
    if (FT_Init_FreeType(&g_ft) || FT_New_Face(g_ft, font_path, 0, &g_face)) {
        fprintf(stderr, "html_view: cannot load font %s\n", font_path);
        g_face = nullptr;
        g_container = nullptr;
        return;
    }
    g_container = new fb_container();
}
extern "C" int html_view_ready(void) { return g_fb && g_face && g_container && g_w > 0 && g_h > 0 && g_pitch_px >= g_w; }

/* Parse + lay out + paint an HTML string into the framebuffer. Returns height. */
extern "C" int html_view_render_html(const char *html)
{
    discard_document();
    if (!html || !html_view_ready()) return -1;
    try {
        g_container->reset_state();
        g_doc = document::createFromString(html, g_container);
        if (!g_doc) return -1;
        g_doc->render((pixel_t)g_w);
        g_doc_w = g_w; g_doc_h = g_h; g_doc_uidir = g_ui_dir;
        detect_pinned_header(); draw_document(true);
        return document_height();
    } catch (...) { discard_document(); return -1; }
}

/* A scroll changes the paint offset, never the document/layout or hit targets.
 * The caller must rebuild when content/CSS changes. Overlays are deliberately
 * excluded because repainting them cannot reconstruct their underlying page. */
extern "C" int html_view_repaint(void)
{
    if (!html_view_ready() || !g_doc || g_doc_overlay || g_doc_w != g_w || g_doc_h != g_h || g_doc_uidir != g_ui_dir) return -1;
    try { draw_document(false); return document_height(); }
    catch (...) { discard_document(); return -1; }
}
extern "C" int html_view_pinned_height(void) { return g_doc && !g_doc_overlay ? g_pinned_height : 0; }

/* Render an overlay on top of the current framebuffer (no clear): the body must
 * be transparent so only its boxes paint. g_doc is set to the overlay so taps
 * hit it. Used for modal dialogs. */
extern "C" int html_view_render_overlay(const char *html)
{
    discard_document();
    if (!html || !html_view_ready()) return -1;
    try {
    g_container->reset_state();
    document::ptr doc = document::createFromString(html, g_container);
    if (!doc) return -1;

    g_doc = doc;
    g_doc_overlay = 1;
    g_doc->render((pixel_t)g_w);
    position clip(0, 0, (pixel_t)g_w, (pixel_t)g_h);
    g_doc->draw((uint_ptr)0, 0, 0, &clip);
    return 0;
    } catch (...) { discard_document(); return -1; }
}

/* Render into a plain logical W*H RGB565 buffer (no rotation) for animations. */
extern "C" int html_view_render_to(uint16_t *buf, const char *html)
{
    uint16_t *sfb = g_fb; int sw = g_w, sh = g_h, sp = g_pitch_px, sr = g_rotate, ssc = g_scroll_y;
    g_fb = buf; g_w = sw; g_h = sh; g_pitch_px = sw; g_rotate = 0; g_scroll_y = 0;
    int hh = html_view_render_html(html);
    g_fb = sfb; g_w = sw; g_h = sh; g_pitch_px = sp; g_rotate = sr; g_scroll_y = ssc;
    return hh;
}

extern "C" int html_view_render_to_scroll(uint16_t *buf, const char *html, int scroll)
{
    uint16_t *sfb = g_fb; int sw = g_w, sh = g_h, sp = g_pitch_px, sr = g_rotate, ssc = g_scroll_y;
    g_fb = buf; g_w = sw; g_h = sh; g_pitch_px = sw; g_rotate = 0; g_scroll_y = scroll < 0 ? 0 : scroll;
    int hh = html_view_render_html(html);
    g_fb = sfb; g_w = sw; g_h = sh; g_pitch_px = sp; g_rotate = sr; g_scroll_y = ssc;
    return hh;
}

static uint16_t *g_saved_fb = nullptr;
static int g_saved_w = 0, g_saved_h = 0, g_saved_pitch = 0, g_saved_rotate = 0, g_saved_scroll = 0;

extern "C" void html_view_target_begin(uint16_t *buf, int scroll)
{
    if (g_saved_fb) return;
    g_saved_fb = g_fb; g_saved_w = g_w; g_saved_h = g_h;
    g_saved_pitch = g_pitch_px; g_saved_rotate = g_rotate; g_saved_scroll = g_scroll_y;
    g_fb = buf; g_pitch_px = g_w; g_rotate = 0; g_scroll_y = scroll < 0 ? 0 : scroll;
}

extern "C" void html_view_target_end(void)
{
    if (!g_saved_fb) return;
    g_fb = g_saved_fb; g_w = g_saved_w; g_h = g_saved_h;
    g_pitch_px = g_saved_pitch; g_rotate = g_saved_rotate; g_scroll_y = g_saved_scroll;
    g_saved_fb = nullptr;
}

/* Off-screen target with native pitch/rotation, for a finite page transition. */
extern "C" void html_view_target_native_begin(uint16_t *buf, int pitch)
{
    g_saved_fb = g_fb; g_saved_w = g_w; g_saved_h = g_h;
    g_saved_pitch = g_pitch_px; g_saved_rotate = g_rotate; g_saved_scroll = g_scroll_y;
    g_fb = buf; g_pitch_px = pitch;
}

extern "C" int html_view_render_to_size(uint16_t *buf, int w, int h, const char *html)
{
    uint16_t *sfb = g_fb; int sw = g_w, sh = g_h, sp = g_pitch_px, sr = g_rotate, ssc = g_scroll_y;
    g_fb = buf; g_w = w; g_h = h; g_pitch_px = w; g_rotate = 0; g_scroll_y = 0;
    int hh = html_view_render_html(html);
    g_fb = sfb; g_w = sw; g_h = sh; g_pitch_px = sp; g_rotate = sr; g_scroll_y = ssc;
    return hh;
}

extern "C" void html_view_set_uidir(const char *d) { g_ui_dir = d ? d : ""; }
extern "C" void html_view_set_scroll(int y) { g_scroll_y = y < 0 ? 0 : y; }
extern "C" void html_view_set_clip_top(int y) { g_clip_top = y < 0 ? 0 : y; }

/* Render the full page (no rotation, no clip to 480) into a tall W*bufh logical
 * buffer, for smooth windowed scrolling. Returns content height. */
extern "C" int html_view_render_tall(uint16_t *buf, const char *html, int bufh)
{
    uint16_t *sfb = g_fb; int sh = g_h, sp = g_pitch_px, sr = g_rotate, ssc = g_scroll_y;
    g_fb = buf; g_h = bufh; g_pitch_px = g_w; g_rotate = 0; g_scroll_y = 0;
    int hh = html_view_render_html(html);
    g_fb = sfb; g_h = sh; g_pitch_px = sp; g_rotate = sr; g_scroll_y = ssc;
    return hh;
}

/* Fill a rect directly (used for the scrollbar overlay). */
extern "C" void html_view_fill_rect(int x, int y, int w, int h, int r, int g, int b, int a)
{
    int x1 = std::max(0, x), x2 = std::min(g_w, x + w);
    int y1 = std::max(g_clip_top, y), y2 = std::min(g_h, y + h);
    for (int yy = y1; yy < y2; yy++)
        for (int xx = x1; xx < x2; xx++)
            put_px(xx, yy, r, g, b, a);
}

/* Fill an arbitrary (possibly concave) polygon via scanline parity. Used by the
 * host to draw shapes litehtml/CSS can't — e.g. the battery charging bolt. */
extern "C" void html_view_fill_poly(const int *xs, const int *ys, int n, int r, int g, int b, int a)
{
    if (n < 3) return;
    int ymin = ys[0], ymax = ys[0];
    for (int i = 1; i < n; i++) { if (ys[i] < ymin) ymin = ys[i]; if (ys[i] > ymax) ymax = ys[i]; }
    ymin = std::max(ymin, g_clip_top); ymax = std::min(ymax, g_h - 1);
    for (int y = ymin; y <= ymax; y++) {
        int xi[16], cnt = 0;
        for (int i = 0; i < n && cnt < 16; i++) {
            int j = (i + 1) % n;
            int y0 = ys[i], y1 = ys[j], x0 = xs[i], x1 = xs[j];
            if (y0 == y1) continue;
            if ((y >= y0 && y < y1) || (y >= y1 && y < y0))
                xi[cnt++] = x0 + (int)((long)(y - y0) * (x1 - x0) / (y1 - y0));
        }
        for (int i = 0; i < cnt; i++)            /* sort intersections ascending */
            for (int k = i + 1; k < cnt; k++)
                if (xi[k] < xi[i]) { int t = xi[i]; xi[i] = xi[k]; xi[k] = t; }
        for (int i = 0; i + 1 < cnt; i += 2)
            for (int x = std::max(0, xi[i]); x <= std::min(g_w - 1, xi[i + 1]); x++)
                put_px(x, y, r, g, b, a);
    }
}

/* Filled rounded rectangle directly (host overlays like the lock icon). */
extern "C" void html_view_fill_round_rect(int x, int y, int w, int h, int rad, int r, int g, int b, int a)
{
    if (w <= 0 || h <= 0) return;
    for (int yy = std::max(g_clip_top, y); yy < std::min(g_h, y + h); yy++)
        for (int xx = std::max(0, x); xx < std::min(g_w, x + w); xx++)
            if (int coverage=rounded_coverage(xx, yy, x, y, w, h, rad, rad, rad, rad))
                put_px(xx, yy, r, g, b, a*coverage/255);
}

extern "C" int html_view_text_width_px(const char *text, int size)
{
    if (!g_face || !text) return 0;
    int w = 0;
    for (const char *s = text; *s; ) {
        unsigned cp = utf8_next(s);
        cached_glyph *gl = glyph_get(cp, size, false);
        if (gl) w += gl->advance;
    }
    return w;
}

extern "C" void html_view_text_bounds_px(const char *text, int size,
                                         int *x0, int *y0, int *x1, int *y1)
{
    if (x0) *x0 = 0;
    if (y0) *y0 = 0;
    if (x1) *x1 = 0;
    if (y1) *y1 = 0;
    if (!g_face || !text) return;
    if (!set_font_size_cached(size)) return;
    int ascent = g_face->size->metrics.ascender >> 6;
    int pen = 0, minx = 0, miny = 0, maxx = 0, maxy = 0, seen = 0;
    for (const char *s = text; *s; ) {
        unsigned cp = utf8_next(s);
        cached_glyph *gl = glyph_get(cp, size, true);
        if (!gl) continue;
        int gx0 = pen + gl->left;
        int gy0 = ascent - gl->top;
        int gx1 = gx0 + gl->width;
        int gy1 = gy0 + gl->rows;
        if (!seen) {
            minx = gx0; miny = gy0; maxx = gx1; maxy = gy1; seen = 1;
        } else {
            if (gx0 < minx) minx = gx0;
            if (gy0 < miny) miny = gy0;
            if (gx1 > maxx) maxx = gx1;
            if (gy1 > maxy) maxy = gy1;
        }
        pen += gl->render_advance;
    }
    if (!seen) return;
    if (x0) *x0 = minx;
    if (y0) *y0 = miny;
    if (x1) *x1 = maxx;
    if (y1) *y1 = maxy;
}

/* Direct labels can overlap at glyph bearings, especially synthetic bold.
 * Combine the native-size masks before touching the framebuffer so contrast
 * selection never samples ink drawn by an earlier pass or adjacent glyph.
 * This transient mask is only the clipped text rectangle (typically a few
 * KiB), with a hard physical-screen-sized ceiling; it is not supersampling. */
static void paint_text_px(int x, int y, const char *text, int size, int bold,
                         bool contrast, int dr, int dg, int db,
                         int lr, int lg, int lb, int a)
{
    if (!g_face || !text || a <= 0 || !set_font_size_cached(size)) return;
    int bx0, by0, bx1, by1;
    html_view_text_bounds_px(text, size, &bx0, &by0, &bx1, &by1);
    int left = std::max(0, x + bx0), top = std::max(std::max(0, g_clip_top), y + by0 - (bold ? 1 : 0));
    int right = std::min(g_w, x + bx1 + (bold ? 1 : 0)), bottom = std::min(g_h, y + by1);
    if (right <= left || bottom <= top) return;
    size_t width = (size_t)(right-left), height = (size_t)(bottom-top);
    if (width > 320 || height > 480) return;
    std::vector<unsigned char> coverage(width * height, 0);
    int pen = x, base = y + (g_face->size->metrics.ascender >> 6);
    for (const char *s = text; *s; ) {
        unsigned cp = utf8_next(s);
        cached_glyph *gl = glyph_get(cp, size, true, bold ? 20 : 0);
        if (!gl) continue;
        int ox = pen + gl->left, oy = base - gl->top;
        int glyph_width = gl->width;
        for (int row = std::max(0, top-oy); row < std::min(gl->rows, bottom-oy); row++)
            for (int col = std::max(0, left-ox); col < std::min(glyph_width, right-ox); col++) {
                int aa = col < gl->width ? gl->pixels[row*gl->width+col] : 0;
                auto &pixel = coverage[(oy+row-top)*width+ox+col-left];
                pixel = std::max(pixel, (unsigned char)aa);
            }
        pen += gl->render_advance;
    }
    for (int yy=top; yy<bottom; yy++) for (int xx=left; xx<right; xx++) {
        int aa=coverage[(yy-top)*width+xx-left];
        if (!aa) continue;
        int r=dr, g=dg, b=db;
        if (contrast) {
            uint16_t bg=get_px565(xx,yy);
            int br=((bg>>11)&31)*255/31, bgc=((bg>>5)&63)*255/63, bb=(bg&31)*255/31;
            if ((br*299+bgc*587+bb*114)/1000 <= 116) { r=lr; g=lg; b=lb; }
        }
        put_px(xx,yy,r,g,b,aa*a/255);
    }
}
extern "C" void html_view_draw_text_px(int x, int y, const char *text, int size, int bold,
                                       int r, int g, int b, int a)
{
    try { paint_text_px(x,y,text,size,bold,false,r,g,b,r,g,b,a); }
    catch (...) { return; }
}
extern "C" void html_view_draw_text_contrast_px(int x, int y, const char *text, int size, int bold,
                                                int dr, int dg, int db, int lr, int lg, int lb, int a)
{
    try { paint_text_px(x,y,text,size,bold,true,dr,dg,db,lr,lg,lb,a); }
    catch (...) { return; }
}

/* Hit-test a tap; returns the clicked anchor href ("" if none). */
extern "C" const char *html_view_click(float x, float y)
{
    g_clicked.clear();
    if (g_doc) {
        position::vector rb;
        float yy = y + (g_doc_overlay || (g_pinned_height && y >= 0 && y < g_pinned_height) ? 0 : g_scroll_y);
        g_doc->on_lbutton_down(x, yy, x, yy, rb);
        g_doc->on_lbutton_up(x, yy, x, yy, rb);
    }
    return g_clicked.c_str();
}

/* ---- custom chart drawing: native polylines into a litehtml placeholder ----
 * Flow: render the page (which lays out an empty <div id="chart-..">), query the
 * div's box with html_view_rect(), then draw series into it with html_view_polyline().
 * Coords are logical (pre-rotation); put_px maps to the panel. */

/* Bresenham line, thick px wide, clipped to [rx,rx+rw) x [ry,ry+rh). */
static void chart_line(int x0, int y0, int x1, int y1,
                       int rx, int ry, int rw, int rh, int r, int g, int b, int thick)
{
    int dx = std::abs(x1 - x0), sx = x0 < x1 ? 1 : -1;
    int dy = -std::abs(y1 - y0), sy = y0 < y1 ? 1 : -1;
    int err = dx + dy;
    for (;;) {
        for (int ty = 0; ty < thick; ty++)
            for (int tx = 0; tx < thick; tx++) {
                int px = x0 + tx, py = y0 + ty;
                if (px >= rx && px < rx + rw && py >= ry && py < ry + rh)
                    put_px(px, py, r, g, b, 255);
            }
        if (x0 == x1 && y0 == y1) break;
        int e2 = 2 * err;
        if (e2 >= dy) { err += dy; x0 += sx; }
        if (e2 <= dx) { err += dx; y0 += sy; }
    }
}

/* Find an element by CSS selector and return its laid-out box. 1 if found. */
extern "C" int html_view_rect(const char *sel, int *x, int *y, int *w, int *h)
{
    if (!g_doc) return 0;
    element::ptr root = g_doc->root();
    if (!root) return 0;
    element::ptr el = root->select_one(sel);
    if (!el) return 0;
    position p = el->get_placement();
    int sy = g_doc_overlay || pinned_element(el) ? 0 : g_scroll_y;
    *x = (int)p.x; *y = (int)p.y - sy; *w = (int)p.width; *h = (int)p.height;
    return (*w > 1 && *h > 1);
}

/* Draw a value series as a polyline inside the rect. vals normalized by
 * [vmin,vmax]; top = vmax. fill_a>0 fills the area under the line at that alpha. */
extern "C" void html_view_polyline(int x, int y, int w, int h,
                                   const int *vals, int n, int vmin, int vmax,
                                   int r, int g, int b, int thick, int fill_a)
{
    if (n <= 0 || w <= 1 || h <= 1) return;
    if (vmax <= vmin) vmax = vmin + 1;

    if (fill_a > 0) {
        for (int col = 0; col < w; col++) {
            double t = (n > 1) ? (double)col / (w - 1) * (n - 1) : 0.0;
            int i0 = (int)t; double fr = t - i0;
            int v0 = vals[i0], v1 = (i0 + 1 < n) ? vals[i0 + 1] : v0;
            double v = v0 + (v1 - v0) * fr;
            if (v < vmin) v = vmin; if (v > vmax) v = vmax;
            int py = y + (h - 1) - (int)((v - vmin) * (h - 1) / (vmax - vmin));
            for (int yy = py; yy < y + h; yy++)
                if (((col + yy) & 1) == 0) put_px(x + col, yy, r, g, b, fill_a);
        }
    }

    int px = 0, py = 0;
    for (int i = 0; i < n; i++) {
        int v = vals[i]; if (v < vmin) v = vmin; if (v > vmax) v = vmax;
        int cx = x + (n > 1 ? i * (w - 1) / (n - 1) : 0);
        int cy = y + (h - 1) - (int)((long)(v - vmin) * (h - 1) / (vmax - vmin));
        if (i > 0) chart_line(px, py, cx, cy, x, y, w, h, r, g, b, thick);
        px = cx; py = cy;
    }
}

/* Same native-pixel 37px micro-chart in production and desktop preview. Both
 * series share one scale; faint guides are proportions, not invented labels.
 * Only actual adjacent samples connect. Missing newest values have no marker.
 * No animation or sampling is scheduled here; repaint/cache policy is owned
 * by the caller. One subtle RX fill costs less than two overlapping fills. */
extern "C" void html_view_rate_chart(int x,int y,int w,int h,const double*rx,const double*tx,int n)
{
    if(!rx||!tx||n<2||n>30||w<8||h<8||w>320||h>96)return;
    double peak=1;bool valid=false;
    for(int i=0;i<n;i++)for(double v:{rx[i],tx[i]})if(std::isfinite(v)&&v>=0){valid=true;peak=std::max(peak,v);}
    if(!valid)return;
    const int plot_x=x+2,plot_w=w-4,baseline=y+h-4;
    const double span=h-8;
    /* Sparse one-pixel grid: it stays visible in data gaps, while values and
     * interpolation never cross them. Inset endpoints remain entirely inside. */
    for(int gy:{y+4,y+(h-1)/2,baseline})for(int col=2;col<w-2;col++)
        if(col%6<2)put_px(x+col,gy,224,238,255,32);
    for(int k=1;k<4;k++)for(int yy=y+4;yy<baseline;yy+=4)
        put_px(plot_x+(plot_w-1)*k/4,yy,224,238,255,20);
    for(int pass=0;pass<2;pass++)for(int series=0;series<2;series++){
        if(!pass&&series)continue;
        const double*values=series?tx:rx;int red=series?106:255,green=series?239:255,blue=series?217:255;
        for(int col=0;col<plot_w;col++){
            double t=(double)col*(n-1)/(plot_w-1);int a=std::min((int)t,n-2),b=a+1;double v0=values[a],v1=values[b];
            if(!std::isfinite(v0)||!std::isfinite(v1)||v0<0||v1<0)continue;
            double value=v0+(v1-v0)*(t-a),py=baseline-value/peak*span;
            if(!pass){for(int yy=std::max(y,(int)py+1);yy<=baseline;yy++){int alpha=(int)(14*(baseline+1-yy)/(baseline+1-py));if(alpha)put_px(plot_x+col,yy,red,green,blue,alpha);}}
            else for(int yy=std::max(y,(int)py-1);yy<=std::min(y+h-1,(int)py+2);yy++){double coverage=std::max(0.0,std::min(1.0,(series?0.95:1.1)-std::abs(yy+.5-py)));put_px(plot_x+col,yy,red,green,blue,(int)(coverage*240));}
        }
    }
    for(int series=0;series<2;series++){
        double v=(series?tx:rx)[n-1];if(!std::isfinite(v)||v<0)continue;
        int cx=plot_x+plot_w-1;double cy=baseline-v/peak*span;
        for(int yy=std::max(y,(int)cy-2);yy<=std::min(y+h-1,(int)cy+2);yy++)for(int xx=cx-2;xx<=cx+2;xx++){
            if(xx<x||xx>=x+w)continue;
            double dx=xx-cx,dy=yy+.5-cy,coverage=std::max(0.0,std::min(1.0,2.3-std::sqrt(dx*dx+dy*dy)));
            put_px(xx,yy,series?106:255,series?239:255,series?217:255,(int)(coverage*255));
        }
    }
}

/* One small chart background permits a finite transition without relaying out
 * the full document. The cache is logical, so the normal 180-degree path applies. */
static uint16_t g_chart_bg[320*96];
static int g_chart_x,g_chart_y,g_chart_w,g_chart_h;
extern "C" int html_view_chart_save(int x,int y,int w,int h){
    g_chart_w=g_chart_h=0;if(w<2||h<8||w>320||h>96||x<0||y<0||x+w>g_w||y+h>g_h)return 0;
    g_chart_x=x;g_chart_y=y;g_chart_w=w;g_chart_h=h;
    for(int j=0;j<h;j++)for(int i=0;i<w;i++)g_chart_bg[j*w+i]=get_px565(x+i,y+j);return 1;
}
extern "C" int html_view_chart_restore(void){
    if(!g_chart_w||!g_chart_h)return 0;for(int j=0;j<g_chart_h;j++)for(int i=0;i<g_chart_w;i++){uint16_t p=g_chart_bg[j*g_chart_w+i];put_px(g_chart_x+i,g_chart_y+j,((p>>11)&31)<<3,((p>>5)&63)<<2,(p&31)<<3,255);}return 1;
}
