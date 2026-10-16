/* Authorized local reuse of the existing UFI credential. No shell, no writes.
 * Contract confirmed from downloaded SQLite schema / JSON key names only;
 * development tests never read the user's credential value. SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0 */
#ifndef TF_UFI_LOCAL_CREDENTIAL_H
#define TF_UFI_LOCAL_CREDENTIAL_H
#if defined(__linux__)
#include <sys/stat.h>
#include <sys/wait.h>
#include <sys/prctl.h>
#include <unistd.h>
#include <fcntl.h>
#include <poll.h>
#include <signal.h>
static int tf_ufi_no_journal(void){const char*paths[]={"/data/ufi-tools/data/ufi-tools.db-wal","/data/ufi-tools/data/ufi-tools.db-journal"};struct stat st;for(int i=0;i<2;i++){if(!lstat(paths[i],&st)){if(!S_ISREG(st.st_mode)||st.st_size)return 0;}else if(errno!=ENOENT)return 0;}return 1;}
static int tf_ufi_local_load(char out[65]){
 const char*path="/data/ufi-tools/data/ufi-tools.db";out[0]=0;if(!tf_ufi_no_journal())return 0;
 int db=open(path,O_RDONLY|O_NOFOLLOW|O_CLOEXEC);struct stat before,after;unsigned char version[4],check[4];if(db<0)return 0;
 if(fstat(db,&before)||!S_ISREG(before.st_mode)||before.st_uid!=0||(before.st_mode&0077)||before.st_nlink!=1||before.st_size<100||before.st_size>64*1024*1024||pread(db,version,4,24)!=4){close(db);return 0;}
 int fds[2];if(pipe2(fds,O_CLOEXEC)){close(db);return 0;}pid_t owner=getpid(),child=fork();if(child==0){
  if(prctl(PR_SET_PDEATHSIG,SIGKILL)||getppid()!=owner)_exit(126);
  int null=open("/dev/null",O_RDWR);if(null<0||dup2(null,STDIN_FILENO)<0||dup2(fds[1],STDOUT_FILENO)<0||dup2(null,STDERR_FILENO)<0)_exit(126);
  /* fd3 pins the checked inode. SQLite immutable mode cannot create journals,
   * shared memory, locks or a missing database. Refuse active WAL/journals. */
  if(db!=3&&dup2(db,3)<0)_exit(126);if(fcntl(3,F_SETFD,0)<0)_exit(126);for(int fd=4;fd<256;fd++)close(fd);
  const char*args[]={"/usr/bin/sqlite3","-noinit","-batch","-noheader","-readonly","file:/proc/self/fd/3?mode=ro&immutable=1","SELECT json_extract(value,'$.login_token_sha256') FROM config WHERE key='app_config' LIMIT 2;",NULL};
  execv(args[0],(char*const*)args);_exit(127);
 }
 close(fds[1]);if(child<0){close(fds[0]);close(db);return 0;}fcntl(fds[0],F_SETFL,O_NONBLOCK);char buffer[130];size_t used=0;int status=0,finished=0,overflow=0;long long deadline=tf_monotonic_ms()+5000;
 while(tf_monotonic_ms()<deadline&&!tf_http_cancelled){if(tf_poll_fd(fds[0],POLLIN,deadline)){ssize_t n=read(fds[0],buffer+used,sizeof buffer-1-used);if(n>0){used+=(size_t)n;if(used>=sizeof buffer-1){overflow=1;break;}}else if(!n)break;else if(errno!=EAGAIN&&errno!=EINTR)break;}else break;}
 close(fds[0]);pid_t reaped=waitpid(child,&status,WNOHANG);if(reaped==child)finished=1;else if(reaped==0){for(int i=0;i<10;i++){struct timespec delay={0,1000000};nanosleep(&delay,NULL);if(waitpid(child,&status,WNOHANG)==child){finished=1;break;}}}if(!finished){kill(child,SIGKILL);while(waitpid(child,&status,0)<0&&errno==EINTR){}}
 buffer[used]=0;while(used&&(buffer[used-1]=='\r'||buffer[used-1]=='\n'))buffer[--used]=0;int okay=finished&&WIFEXITED(status)&&WEXITSTATUS(status)==0&&!overflow&&!tf_http_cancelled&&used==64;
 for(size_t i=0;okay&&i<used;i++)if(!isxdigit((unsigned char)buffer[i]))okay=0;
 if(fstat(db,&after)||before.st_ino!=after.st_ino||before.st_dev!=after.st_dev||before.st_size!=after.st_size||before.st_mtim.tv_sec!=after.st_mtim.tv_sec||before.st_mtim.tv_nsec!=after.st_mtim.tv_nsec||pread(db,check,4,24)!=4||memcmp(version,check,4)||!tf_ufi_no_journal())okay=0;
 if(okay){for(size_t i=0;i<64;i++)out[i]=(char)tolower((unsigned char)buffer[i]);out[64]=0;}tf_ufi_wipe(buffer,sizeof buffer);close(db);return okay;
}
#else
static int tf_ufi_local_load(char out[65]){out[0]=0;return 0;}
#endif
#endif
