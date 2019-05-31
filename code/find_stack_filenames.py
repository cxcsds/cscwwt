#!/usr/bin/env python

SEE get_stack_names.py instead

"""
Usage:

  ./find_stack_filenames.py stkfile products

Aim:

Query the catalogue to find the file names for the given stack
products. The stkfile must contain a stack column, this is used as the
stack id in the query. The products argument is a stack of filetypes
(and optional bands).

The output is to the screen as a JSON file.
"""

from six.moves import urllib
import time

import pycrates

import json


# TIMEFORMAT_OUT = '%Y-%m-%d %H:%M'

BASEURL = "http://cda.harvard.edu/csccli/browse"


def make_stack_url(stack, props):
    """Return the URL for querying the file names.

    This should URL encode the query, but we should be okay with
    our queries.
    """

    out = "{}?version=cur&packageset=".format(BASEURL)
    pkgs = []
    for prop in props:
        pkgs.append("{}/{}".format(stack, prop))

    out += ",".join(pkgs)
    return out


def make_query(url):
    """Query CSC and parse the response.

    It is REQUIRED that there be only one filetype (e.g. sensity)
    in the response. This means that '/sensity' or
    '/sensity/b,/sensity/s' are invalid queries.
    """

    try:
        ans = urllib.request.urlopen(url).read()
    except urllib.error.URLError as ue:
        sys.stderr.write("ERROR: failed query {}\n{}".format(url, ue))
        return None

    # oh, let's be all python3-ey
    jcts = json.loads(resp.decode('utf8'))
    out = {}
    for ans in jcts:
        try:
            filename = ans['filename']
            filetype = ans['filetype']
        except KeyError as le:
            sys.stderr.write("Error: query missing - {}\n".format(ke))
            return None

        if filetype in out:
            sys.stderr.write("MULTIPLE {} keys\n".format(filetype))

        out[filetype] = filename

    if len(out) == 0:
        sys.stderr.write("No data from query\n")
        return None

    return out


def find_stack_filenames(infile, props):
    """Find the filenames for the stack products.

    Parameters
    ----------
    infile : str
        The name of the file. It must contain a stack column; the value
        is used as the stack id.
    props : list_of_str
        The file types, with optional band specifiers.

    """

    filename = "{}[cols stack]".format(infile)
    cr = pycrates.read_file(filename)
    if cr.get_nrows() == 0:
        raise IOError("No rows read from {}".format(filename))

    # go overboard in ensuring we have a string version that is not
    # part of a crate
    stacks = [str(c) for c in cr.stack.values.copy()]
    cr = None

    # Note: there is no attempt to batch the queries
    #
    out = {}
    for stack in stacks:

        url = make_stack_url(stack, props)
        ans = make_query(url)
        if ans is None:
            continue

        out[stack] = ans

    # Should this get converted to ISO 8661 (or whatever) format?
    out['lastupdate'] = time.asctime()

    print(json.dumps(out))


def usage(progname):
    sys.stderr.write("Usage: {} stkfile props\n".format(progname))
    sys.exit(1)


if __name__ == "__main__":

    import sys
    import stk

    if len(sys.argv) != 3:
        usage(sys.argv[0])

    infile = sys.argv[1]
    props = stk.build(sys.argv[2])
    """
    for p in props:
        if p not in valid_props:
            raise ValueError("Invalid property '{}'".format(p))
    """

    find_stack_filenames(infile, props)
