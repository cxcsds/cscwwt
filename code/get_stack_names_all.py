#!/usr/bin/env python

"""
Usage:

  python get_stack_names_all.py infile

Aim:

Query csccli to return the "name" of the stack data files - that
is, the file name needed to query the csccli to get the data product.

infile must have a stack column

The option is for b or w band only (when an image) and runs *ALL* of

  stkevt3
  stkecorrimg
  stkbkgimg
  stkexpmap
  sensity

See get_stack_names.py for an option where you query by option.

"""


import math
import numpy as np

import sys

from six.moves import urllib

import json


all_options = ['stkevt3', 'stkecorrimg', 'stkbkgimg', 'stkexpmap', 'sensity']


def get_url(stacks, options, maxlen=4000):
    """Get the URL up to the given length and then
    return the remaining.

    Note that to make this easier (both to loop over and to process
    the results), we only include a stack in the URL
    if all properties can be queried at once. This means that this
    does *not* minimise the number of calls.

    Returns
    -------
    url, remaining_stack: str, list_of_str

    """

    # version = 'version=cur&'
    version = ''
    head = 'http://cda.harvard.edu/csccli/browse?{}packageset='.format(version)

    nchar = len(head)
    if nchar >= maxlen:
        raise ValueError("maxlen={} is too small".format(maxlen))

    processed_stacks = []

    for i, stack in enumerate(stacks):
        codes = []
        for option in options:
            code = '{}%2F{}'.format(stack, option)

            if option != 'stkevt3':
                code += '%2F'
                if stack.startswith('hrc'):
                    code += 'w'
                else:
                    code += 'b'

            codes.append(code)

        code = ",".join(codes)
        if i > 0:
            code = "," + code

        newlen = nchar + len(code)
        if newlen > maxlen:
            return head, stacks[i:], processed_stacks

        head += code
        nchar = newlen

        processed_stacks.append(stack)

    return head, [], processed_stacks


def report_filename(fhs, stacks):
    """Write the report to all the files in fhs"""

    options = list(fhs.keys())
    url, rstacks, processed_stacks = get_url(stacks, options)
    assert len(processed_stacks) > 0
    assert len(stacks) > len(rstacks)

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
    # input order though. Fortunately the productId should allow us
    # to match things.
    #
    filenames = {option: {} for option in options}
    for content in cts:
        try:
            # note that filetype does not include any band-specific
            # information, but that's okay here.
            filestack = content['productId']
            filetype = content['filetype']
            filename = content['filename']
        except KeyError as ke:
            sys.stderr.write("Error: {} in {}\n".format(ke, content))
            continue

        assert filestack in processed_stacks

        assert filetype in filenames
        fileinfo = filenames[filetype]

        if filestack in fileinfo:
            sys.stderr.write("MULTIPLE RESPONSES for {} {}:\n".format(filetype, filestack))
            sys.stderr.write("  {}\n".format(fileinfo[filestack]))
            sys.stderr.write("  {}\n".format(filename))

        fileinfo[filestack] = filename

    # output per option
    #
    expected_stacks = set(processed_stacks)
    nmiss = 0
    for option in options:
        fileinfo = filenames[option]
        fh = fhs[option]

        got_stacks = set(list(fileinfo.keys()))
        if got_stacks != expected_stacks:
            missing = expected_stacks.difference(got_stacks)
            extra = got_stacks.difference(expected_stacks)
            assert len(extra) == 0
            sys.stderr.write("No {} data for stacks: {}\n".format(option, sorted(list(missing))))

            nmiss = max(nmiss, len(missing))

        for stack in processed_stacks:
            if stack not in fileinfo:
                continue

            fh.write("{} {}\n".format(stack, fileinfo[stack]))

        fh.flush()

    return rstacks, nmiss


def usage():
    sys.stderr.write("Usage: {} stackfile\n".format(sys.argv[0]))
    sys.exit(1)


if __name__ == "__main__":

    nargs = len(sys.argv)
    if nargs != 2:
        usage()

    stacks = []
    with open(sys.argv[1], 'r') as fh:
        for l in fh.readlines():
            l = l.strip()
            if l == '' or l.startswith('#'):
                continue

            stack = l.split()[0]
            assert stack.startswith('acisfJ') or stack.startswith('hrcfJ')
            assert stack.endswith('_001')
            stacks.append(stack)

    nstacks = len(stacks)
    assert nstacks == 7287

    # Create the output files
    fhs = {}
    for option in all_options:
        fh = open('version.{}'.format(option), 'w')
        fh.write('# stack filename\n')
        fhs[option] = fh

    nmiss_total = 0

    # print("# nstacks_left  nmissing")
    # print("{:4d} {}".format(len(stacks), nmiss_total))

    while len(stacks) > 0:
        rstacks, nmiss = report_filename(fhs, stacks)
        nmiss_total += nmiss
        stacks = rstacks
        # print("{:4d} {}".format(len(stacks), nmiss_total))
        # sys.stdout.flush()

    for option, fh in fhs.items():
        fh.close()
        print('Created: version.{}'.format(option))
