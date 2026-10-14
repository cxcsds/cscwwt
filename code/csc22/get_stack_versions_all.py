#!/usr/bin/env python

"""
Usage:

  ./get_stack_versions_all.py infile

Aim:

Query csccli to return the "name" of the stack data files - that
is, the file name needed to query the csccli to get the data product.

infile must have a stack column; the ids do not need to be unique. It
is read in as an ASCII file and any '#...' line is skipped.

The option is for b or w band only (when an image) and runs *ALL* of

  stkevt3
  stkecorrimg
  stkbkgimg
  stkexpmap
  sensity

See get_stack_names.py for an option where you query by option.

"""

from io import TextIOWrapper
import json
import sys
import urllib
import urllib.error
import urllib.request


all_options: list[str] = ['stkevt3', 'stkecorrimg', 'stkbkgimg',
                          'stkexpmap', 'sensity']


def get_url(stacks: list[str],
            option: str,
            maxlen: int = 4000
            ) -> tuple[str, list[str], list[str]]:
    """Get the URL up to the given length and then
    return the remaining.

    Returns
    -------
    url, remaining_stack: str, list_of_str

    """

    version = 'version=cur&'
    # version = 'version=rel2.2&'
    head = f'https://cda.harvard.edu/csccli/browse?{version}packageset='

    nchar = len(head)
    if nchar >= maxlen:
        raise ValueError(f"maxlen={maxlen} is too small")

    processed_stacks = []
    for i, stack in enumerate(stacks):

        code = f'{stack}%2F{option}'
        if option != 'stkevt3':
            code += '%2F'
            if stack.startswith('hrc'):
                code += 'w'
            else:
                code += 'b'

        if i > 0:
            code = "," + code

        newlen = nchar + len(code)
        if newlen > maxlen:
            return head, stacks[i:], processed_stacks

        head += code
        nchar = newlen

        processed_stacks.append(stack)

    return head, [], processed_stacks


def report_filename(fh: TextIOWrapper,
                    option: str,
                    stacks: list[str],
                    debug: bool = False
                    ) -> tuple[list[str], int]:
    """Write the report to all the files in fhs"""

    url, rstacks, processed_stacks = get_url(stacks, option)
    assert len(processed_stacks) > 0
    assert len(stacks) > len(rstacks)

    if debug:
        sys.stdout.write(f"url: {url}\n")
        sys.stdout.flush()

    try:
        resp = urllib.request.urlopen(url).read()
    except urllib.error.URLError as ue:
        sys.stderr.write(f"ERROR: url={url} error={ue}\n")
        # sys.exit(1)
        return rstacks, len(processed_stacks)

    # oh, let's be all python3-ey
    cts = json.loads(resp.decode('utf8'))
    if len(cts) == 0:
        sys.stderr.write(f"ERROR: stacks={stacks}/{option} returned {cts}")
        return rstacks, len(processed_stacks)

    # We can not guarantee the ordering of the response (e.g. in the
    # case of missing files). We want the output order to match the
    # input order though. Fortunately the productId should allow us
    # to match things.
    #
    fileinfo = {}
    for content in cts:
        try:
            # note that filetype does not include any band-specific
            # information, but that's okay here.
            filestack = content['productId']
            filetype = content['filetype']
            filename = content['filename']
        except KeyError as ke:
            sys.stderr.write(f"Error: {ke} in {content}\n")
            continue

        assert filestack in processed_stacks
        assert filetype == option, (filetype, option)

        if filestack in fileinfo:
            sys.stderr.write(f"MULTIPLE RESPONSES for {filetype}"
                             f" {filestack}:\n")
            sys.stderr.write(f"  {fileinfo[filestack]}\n")
            sys.stderr.write(f"  {filename}\n")

        fileinfo[filestack] = filename

    # output per option
    #
    expected_stacks = set(processed_stacks)
    nmiss = 0

    got_stacks = set(fileinfo.keys())
    if got_stacks != expected_stacks:
        missing = expected_stacks.difference(got_stacks)
        extra = got_stacks.difference(expected_stacks)
        assert len(extra) == 0
        sys.stderr.write(f"No {option} data for stacks: "
                         f"{sorted(missing)}\n")

        nmiss = max(nmiss, len(missing))

    for stack in processed_stacks:
        if stack not in fileinfo:
            continue

        fh.write(f"{stack} {fileinfo[stack]}\n")

    fh.flush()

    return rstacks, nmiss


def usage():
    sys.stderr.write(f"Usage: {sys.argv[0]} stackfile --debug\n")
    sys.exit(1)


if __name__ == "__main__":

    nargs = len(sys.argv)
    if nargs < 2 or nargs > 3:
        usage()

    debug = False
    has_infile = False
    infile = ""
    for arg in sys.argv[1:]:
        if arg == "--debug":
            debug = True
        else:
            if has_infile:
                usage()

            infile = arg
            has_infile = True

    if not has_infile:
        usage()

    stacklist = set()
    with open(infile, 'r') as fh:
        for l in fh:
            l = l.strip()
            if l == '' or l.startswith('#'):
                continue

            stack = l.split()[0]
            assert stack.startswith(('acisfJ', 'hrcfJ'))
            assert stack.endswith(('_001', '_002', '_003'))
            stacklist.add(stack)

    all_stacks = sorted(stacklist)
    nstacks = len(all_stacks)
    assert nstacks == 11317, nstacks  # CSC 2.2

    hdr = 'version22'

    for option in all_options:

        sys.stdout.write(f"# {option}\n")
        sys.stdout.flush()

        outfile = f'{hdr}.{option}'
        with open(outfile, mode='wt') as fh:
            fh.write('# stack filename\n')
            fh.flush()

            stacks = all_stacks[:]
            nmiss_total = 0
            if debug:
                sys.stdout.write("# nstacks_left  nmissing\n")
                sys.stdout.write(f"{len(stacks):4d} {nmiss_total}\n")
                sys.stdout.flush()

            while len(stacks) > 0:
                rstacks, nmiss = report_filename(fh, option, stacks, debug=debug)
                nmiss_total += nmiss
                stacks = rstacks
                if debug:
                    sys.stdout.write(f"{len(stacks):4d} {nmiss_total}\n")
                    sys.stdout.flush()

        sys.stdout.write(f'Created: {outfile}\n\n')
        sys.stdout.flush()
