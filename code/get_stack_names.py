#!/usr/bin/env python

"""
Usage:

  python get_stack_names.py infile [stkevt3|sensity]

Aim:

Query csccli to return the "name" of the stack data files - that
is, the file name needed to query the csccli to get the data product.

infile must have a stack column

The options are stkevt3 or sensity - which means b or w band.

"""

import sys

from six.moves import urllib

import json


def get_url(stack, proptype):

    url = 'http://cda.harvard.edu/csccli/browse?version=cur&packageset={}%2F{}'.format(stack, proptype)
    if proptype == 'sensity':
        url += '%2F'
        if stack.startswith('hrc'):
            url += 'w'
        else:
            url += 'b'

    return url


def report_filename(stack, proptype):

    url = get_url(stack, proptype)

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


def usage():
    sys.stderr.write("Usage: {} ".format(sys.argv[0]))
    sys.stderr.write("stackfile [stkevt3|sensity]\n")
    sys.exit(1)


if __name__ == "__main__":

    nargs = len(sys.argv)
    if nargs < 2 or nargs > 3:
        usage()

    if nargs == 2:
        proptype = 'stkevt3'
    elif sys.argv[2] in ['stkevt3', 'sensity']:
        proptype = sys.argv[2]
    else:
        usage()

    infile = sys.argv[1] + "[cols stack]"

    import pycrates
    cr = pycrates.read_file(infile)
    if cr.get_nrows() == 0:
        raise IOError("No stacks in {}".format(infile))

    print("# stack filename")
    for stk in cr.get_column('stack').values:
        report_filename(stk, proptype)
