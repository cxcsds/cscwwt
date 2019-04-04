#!/usr/bin/env python

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
    """Query CSC and parse the response."""

    try:
        ans = urllib.request.urlopen(url).read()
    except urllib.error.URLError as ue:
        sys.stderr.write("ERROR: failed query {}\n{}".format(url, ue))
        return None

    raise NotImplementedError


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
        print(url)

        raise NotImplementedError

    # Should this get converted to ISO 8661 (or whatever) format?
    out['lastupdate'] = time.asctime()

    raise NotImplementedError

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
