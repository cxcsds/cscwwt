#!/usr/bin/env python -w

"""
Usage:

  ./parse_evtnames.py output-of-get_evtnames.py [default-version]

Aim:

Construct a JSON file mapping from stack id to version number. The
default value is taken to be 20, unless explicitly listed. This is
used

a) to save space
b) to handle cases where we are missing the mapping data
   (under the assumption that 20 is still valid)

"""

import sys

from collections import OrderedDict

import json


def convert(infile, default_version, filetype='stkevt3'):

    # Force an ordering to avoid un-needed reloads (by web browser)
    out = OrderedDict()
    out['filetype'] = filetype
    out['versions'] = OrderedDict()

    # Parse into the full structure, and only later handle the
    # default version
    #
    ndef = 0
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

            # Is an integer smaller than a 3-character string - for
            # our purposes it should be.
            #
            out['versions'][stack] = ver

            if ver == default_version:
                ndef += 1

    if ndef == 0:
        raise ValueError("No matches to default version={}".format(devault_version))

    out['default_version'] = default_version
    out['ndefault_version'] = ndef
    delete = []
    for stack, ver in out['versions'].items():
        if ver == default_version:
            delete.append(stack)

    assert len(delete) == ndef
    for stack in delete:
        del out['versions'][stack]

    print(json.dumps(out))


def usage(progname):
    sys.stderr.write("Usage: {} infile [default-value]\n".format(progname))
    sys.exit(1)


if __name__ == "__main__":

    nargs = len(sys.argv)
    if (nargs < 2) or (nargs > 3):
        usage(sys.argv[0])

    defver = 20
    if nargs == 3:
        defver = int(sys.argv[2])
        if (defver < 1) or (defver > 999):
            raise ValueError("Invalid defver={}".format(sys.argv[2]))

    convert(sys.argv[1], defver)
