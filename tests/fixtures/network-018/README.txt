observed-state.json retains the field shape of a historical compatibility fixture.
In this public-source edition, traffic quantities and cell identity were replaced
with synthetic values. It is not an unmodified device observation. No credentials,
IP addresses, subscriber/device identifiers, phone numbers or SMS are included.

Native test-network-status.c additionally uses explicit contract boundary fixtures.
The first CA descriptor is copied from zwrt-datad v0.10.79 docs/STATE_SCHEMA.md:89.
These fixtures and test source are not included in the device payload.
