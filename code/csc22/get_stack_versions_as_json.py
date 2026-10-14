#!/usr/bin/env python -w

"""
Usage:

  ./get_stack_versios_as_json.py <option>

Aim:

Construct a JSON file mapping from stack id to version number. The
assumption is that one version number is going to dominate the
counts, so we only have to give versions for stacks that don't
meet this version.

The option must be one of:

  stkevt3
  stkecorrimg
  stkbkgimg
  stkexpmap
  sensity

and assumes there is only a single band for each stack (for the case
where there are multiple bands for a file type).

The output is

  version22.<option>.json

"""

import sys

from collections import OrderedDict, defaultdict

import json

VERSION: str = "version22"
NSTACKS: int = 11317


def convert(filetype: str) -> None:

    infile = f"{VERSION}.{filetype}"
    outfile = f"{VERSION}.{filetype}.json"

    # Force an ordering to avoid un-needed reloads (by web browser)
    out = OrderedDict()
    out['filetype'] = filetype
    out['versions'] = OrderedDict()

    # Grab the file name and extract the version number.
    #
    versions = defaultdict(int)
    print(f"Reading from: {infile}")
    with open(infile, 'r') as fh:
        for l in fh.readlines():
            l = l.strip()
            if l == '' or l.startswith('#'):
                continue

            toks = l.split()
            assert len(toks) == 2, l

            stack = toks[0]
            assert stack not in out['versions'], stack
            filename = toks[1]

            idx = filename.find('N')
            assert idx > 0, filename

            verstr = filename[idx + 1:idx + 4]
            try:
                ver = int(verstr)
            except TypeError:
                assert False, filename

            out['versions'][stack] = ver

            versions[ver] += 1

    # What is the default version
    vs = sorted(list(versions.items()), key=lambda x: x[1], reverse=True)
    assert len(vs) > 0
    default_version = vs[0][0]
    ndef = vs[0][1]

    # Output to stderr so not included in output
    sys.stderr.write("Version breakdown\n")
    total = 0
    for v, c in vs:
        sys.stderr.write(f"  version= {v:3d}  count= {c}\n")
        total += c

    if total != NSTACKS:
        raise OSError(f"Expected {NSTACKS} stacks, found {total}")

    out['default_version'] = default_version
    out['ndefault_version'] = ndef
    delete = []
    for stack, ver in out['versions'].items():
        if ver == default_version:
            delete.append(stack)

    assert len(delete) == ndef
    for stack in delete:
        del out['versions'][stack]

    with open(outfile, mode='wt') as ofh:
        ofh.write(json.dumps(out))

    print(f"Created: {outfile}")


options = ['stkevt3', 'stkecorrimg', 'stkbkgimg', 'stkexpmap', 'sensity']


def usage():
    sys.stderr.write(f"Usage: {sys.argv[0]} <option>\n")
    sys.stderr.write("\n<option> is one of:\n")
    sys.stderr.write(f"  {" ".join(options)}\n")
    sys.exit(1)


if __name__ == "__main__":

    nargs = len(sys.argv)
    if nargs != 2:
        usage()

    filetype = sys.argv[1]
    if filetype not in options:
        usage()

    convert(filetype)
