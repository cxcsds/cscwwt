#!/usr/bin/env python

"""
Usage:

  python get_stack_names.py infile <option>

Aim:

Query csccli to return the "name" of the stack data files - that
is, the file name needed to query the csccli to get the data product.

infile must have a stack column

The option is for b or w band only (when an image) and must be one of:

  stkevt3
  stkecorrimg
  stkbkgimg
  stkexpmap
  sensity

"""

import math
import numpy as np

import sys

from six.moves import urllib

import json


def get_url(stacks, proptype):

    codes = []
    for stack in stacks:
        code = '{}%2F{}'.format(stack, proptype)

        if proptype != 'stkevt3':
            code += '%2F'
            if stack.startswith('hrc'):
                code += 'w'
            else:
                code += 'b'

        codes.append(code)

    code = ",".join(codes)

    # version = 'version=cur&'
    version = ''

    url = 'http://cda.harvard.edu/csccli/browse?{}packageset={}'.format(version, code)
    return url


def report_filename(stacks, proptype):

    url = get_url(stacks, proptype)

    try:
        resp = urllib.request.urlopen(url).read()
    except urllib.error.URLError as ue:
        sys.stderr.write("ERROR: url={} error={}\n".format(url, ue))
        # sys.exit(1)
        return

    # oh, let's be all python3-ey
    cts = json.loads(resp.decode('utf8'))
    if len(cts) == 0:
        sys.stderr.write("ERROR: stacks={} returned {}\n".format(stacks,
                                                                 cts))
        return

    # We can not guarantee the ordering of the response (e.g. in the
    # case of missing files). We want the output order to match the
    # input order though.
    #
    fstacks = []
    filenames = {}
    for content in cts:
        try:
            filename = content['filename']
        except KeyError:
            sys.stderr.write("Error: no filename in {}\n".format(content))
            continue

        for stack in stacks:
            if stack in filename:
                if stack in filenames:
                    sys.stderr.write("MULTIPLE RESPONSES for {}:\n".format(stack))
                    sys.stderr.write("  {}\n".format(filenames[stack]))
                    sys.stderr.write("  {}\n".format(filename))

                filenames[stack] = filename
                fstacks.append(stack)

                # could call continue here, but safety check

    for stack in stacks:
        try:
            sys.stdout.write("{} {}\n".format(stack, filenames[stack]))
        except KeyError:
            pass

    sys.stdout.flush()

    sgot = set(fstacks)
    if len(sgot) != len(fstacks):
        raise ValueError("Multiple matches to stack:\n{}\n".format(fstacks))

    sexp = set(stacks)
    if sgot == sexp:
        return 0

    smissing = sexp.difference(sgot)
    if len(smissing) > 0:
        sys.stderr.write("No data for stack(s):\n{}\n".format(smissing))
        return len(smissing)

    else:
        sys.stderr.write("somehow got more stacks:\n{}\n{}\n".format(sexp,
                                                                     sgot))
        return 0


options = ['stkevt3', 'stkecorrimg', 'stkbkgimg', 'stkexpmap', 'sensity']


def usage():
    sys.stderr.write("Usage: {} ".format(sys.argv[0]))
    sys.stderr.write("stackfile <option>\n")
    sys.stderr.write("\n<option> is one of:\n")
    sys.stderr.write("  {}\n".format(" ".join(options)))
    sys.exit(1)


if __name__ == "__main__":

    nargs = len(sys.argv)
    if nargs != 3:
        usage()

    if sys.argv[2] in options:
        proptype = sys.argv[2]
    else:
        usage()

    infile = sys.argv[1] + "[cols stack]"

    import pycrates
    cr = pycrates.read_file(infile)
    if cr.get_nrows() == 0:
        raise IOError("No stacks in {}".format(infile))

    print("# stack filename")
    stacks = cr.get_column('stack').values
    nstacks = len(stacks)

    # try to avoid the URL being too long; pick 24 as a guess
    # (character length of stack + extra coding is < 40 characters,
    # 24 * 40 = 960, so total url length is <~ 1024 characters.
    # It can probably be larger, but let's see how this goes.
    #
    # NumPy's array_split routine takes the number of chunks, rather
    # than the number of elements per chunk
    #
    nmiss = 0
    chunksize = 24
    if nstacks <= chunksize:
        nmiss = report_filename(stacks, proptype)

    else:
        nchunks = math.ceil(nstacks / chunksize)
        for chunk in np.array_split(stacks, nchunks):
            nmiss =+ report_filename(chunk, proptype)

    if nmiss > 0:
        sys.stderr.write("\nMissing files for {} stack(s)\n".format(nmiss))
