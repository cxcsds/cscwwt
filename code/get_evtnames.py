#!/usr/bin/env python

"""
Usage:

  python get_evtnames.py infile

Aim:

Query csccli to return the "name" of the stack event files - that
is, the file name needed to query the csccli to get the data product.

infile must have a stack column

"""

import sys

from six.moves import urllib

import json


def report_evtname(stack):

    url = 'http://cda.harvard.edu/csccli/browse?version=cur&packageset={}%2Fstkevt3'.format(stack)

    try:
        resp = urllib.request.urlopen(url).read()
    except urllib.error.URLError as ue:
        sys.stderr.write("ERROR: url={} error={}\n".format(url, ue))
        # sys.exit(1)
        return

    # oh, let's be all python3-ey
    cts = json.loads(resp.decode('utf8'))
    if len(cts) != 1:
        sys.stderr.write("ERROR: stack={} returned {}\n".format(stack, cts))
        return

    try:
        filename = cts[0]['filename']
    except KeyError:
        sys.stderr.write("Error: stack={} no filename in {}\n".format(stack, cts))
        return

    print("{} {}".format(stack, filename))
    sys.stdout.flush()


if __name__ == "__main__":

    if len(sys.argv) != 2:
        sys.stderr.write("Usage: {} stacks\n".format(sys.argv[0]))
        sys.exit(1)

    infile = sys.argv[1] + "[cols stack]"

    import pycrates
    cr = pycrates.read_file(infile)
    if cr.get_nrows() == 0:
        raise IOError("No stacks in {}".format(infile))

    print("# stack filename")
    for stk in cr.get_column('stack').values:
        report_evtname(stk)
