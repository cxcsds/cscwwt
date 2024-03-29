#!/usr/bin/env python

"""Usage:

 ./make_status.py [stackfile]

Aim:

Create the status data for CSC 2.1. The stackfile should be
the DSops file - e.g.

  /home/ascdsops/l3stacks/cat21_stack_status.lis

and we default to that if not given.

We use the date of the file creation as the "last-modified"
date for the database.

The output files are

    wwt21_srcprop.*.json
    wwt21_status.json
    status.xml
    stacks-2.1.txt

"""

from collections import OrderedDict
from pathlib import Path
import json
import sys
import time

import stackdata


class RoundingFloat(float):
    """See https://stackoverflow.com/a/69056325

    Note that we use the g format to try and handle
    both values like 3.4234 and 7.42352e-16. The
    default for g seems to be 5dp so bump to 6dp
    just in case.
    """

    @staticmethod
    def __repr__(x):
        # just brute-force it, even if it is slow
        old = repr(x)
        new = f"{x:.6g}"
        if len(new) < len(old):
            return new
        return old


json.encoder.c_make_encoder = None
json.encoder.float = RoundingFloat


def get_time(tstr):
    # ignore time zone
    t = time.strptime(tstr, "%Y-%m-%dT%H:%M:%S")
    return int(time.mktime(t))


def get_stack_pos(stackid):
    """Given a stack id extract approximate ra,dec in decimal degrees"""

    if stackid.startswith('acisfJ'):
        loc = stackid[6:-4]
    elif stackid.startswith('hrcfJ'):
        loc = stackid[5:-4]
    else:
        raise ValueError(stackid)

    raStr = loc[:7]
    decStr = loc[8:]
    if loc[7] == "p":
        sval = 1
    elif loc[7] == "m":
        sval = -1
    else:
        raise ValueError(stackid)

    h = int(raStr[0:2])
    m = int(raStr[2:4])
    s = int(raStr[4:]) / 10
    ra = 15 * (h + (m + (s / 60)) / 60)

    d = int(decStr[0:2])
    m = int(decStr[2:4])
    s = int(decStr[4:])
    dec = d + (m + (s / 60)) / 60

    return ra, sval * dec


def read_status(infile):
    """Read in the stack status."""

    out = {}
    for l in infile.read_text().split("\n"):
        if l == "":
            continue

        toks = l.split()
        assert len(toks) in [2, 3], l

        stack = toks[0]
        assert stack not in out

        state = toks[1]
        store = {"state": state}

        if state == "Completed":
            store["completed_str"] = toks[2]
            try:
                store["completed_int"] = get_time(toks[2])
            except ValueError as v:
                raise ValueError(f"time error in {l}") from v

        out[stack] = store

    # get the last-modified date from the file
    lmod = time.localtime(infile.lstat().st_mtime)
    lmod_txt = time.strftime("%Y-%m-%d %H:%M", lmod)

    return out, lmod_txt


def write_json(processing, lmod_db, stack_count, source_data):

    # If most of the stacks are processed then it would make sense to
    # have a single data structure for each stack, but for now
    # have separate structures.
    #
    out = {"stacks": {}, "completed": {}, "nsource": {}}
    for stack in processing:

        assert stack not in out["stacks"]
        sdata = processing[stack]
        state = sdata["state"]

        if state == "Completed":
            out["stacks"][stack] = 1
            out["completed"][stack] = sdata["completed_int"]

            # only do this for the completed stacks
            try:
                nstack = stack_count[stack]
            except KeyError:
                nstack = 0

            out["nsource"][stack] = nstack

        elif state == "Processing":
            out["stacks"][stack] = 2

        elif state == "Pending":
            out["stacks"][stack] = 0

        else:
            raise ValueError(f"Unexpected line: {l}")

    # For now use UTC
    lmod = time.gmtime()
    txt = time.strftime("%Y-%m-%d %H:%M", lmod)
    out["lastupdate"] = txt

    out["lastupdate_db"] = lmod_db


    out["nsources"] = len(source_data["rows"])
    out["nchunks"] = source_data["nchunks"]

    outfile = "wwt21_status.json"
    with open(outfile, "wt") as fh:
        fh.write(json.dumps(out, sort_keys=True))

    print(f"Created: {outfile}")


def write_xml(processing, lmod_db, stack_count):
    """The XML status page."""

    indir = Path("ian-2022-02-07")
    status = stackdata.find_stack_status(indir)
    all_obis = stackdata.find_stack_obis(indir)
    all_names = stackdata.read_cxc_targetnames()
    outfile = "status.xml"

    with open(outfile, "wt") as fh:

        fh.write(f"""<?xml version="1.0" encoding="utf-8" ?>
<!DOCTYPE page>

<page>
  <!-- THIS FILE IS AUTO_GENERATED: SEE {sys.argv[0]} -->
  <info>

    <title>
      <short>Processing status: CSC 2.1</short>
    </title>
    <navbar>main</navbar>
    <version>2.1</version>

    <!-- see https://datatables.net/download/index -->
    <htmlscripts>
      <htmlscript src="https://cdn.datatables.net/v/dt/jq-3.6.0/jszip-2.5.0/dt-1.12.1/b-2.2.3/b-colvis-2.2.3/b-html5-2.2.3/b-print-2.2.3/sl-1.4.0/datatables.min.js"/>
    </htmlscripts>

    <css src="https://cdn.datatables.net/v/dt/jq-3.6.0/jszip-2.5.0/dt-1.12.1/b-2.2.3/b-colvis-2.2.3/b-html5-2.2.3/b-print-2.2.3/sl-1.4.0/datatables.min.css"/>
""")

        # As about to write CSS, and hence lots of { } pairs,
        # easier to do not in a f-string.
        #
        # I tried updating the dt-button class to better match
        # the CSC styling but there's too much to change and it
        # doesn't feel worth it.
        #
        fh.write("""
    <css>
h1 { text-align: center; }
td { text-align: center; }
.qlinkbar { text-align: center; }

.filename { font-family: monospace; }

.caption {
  text-align: center;
}

/* style the datatable elements; may need to be updated if the code changes */
div.dt-buttons {
  float: none;
  padding: 0.5em 0;
  text-align: center;
}
    </css>
  </info>
""")

        nstack_total = 10034
        nobi_total = 15533

        nstack_processed = 0
        nobi_processed = 0
        for stack in processing:
            sdata = processing[stack]
            if sdata["state"] != "Completed":
                continue

            nstack_processed += 1
            nobi_processed += len(all_obis[stack])

        def make_pcen(current, total):
            return f"{current * 100 / total:.1f}%"

        nstack_processed_pcen = make_pcen(nstack_processed, nstack_total)
        nobi_processed_pcen = make_pcen(nobi_processed, nobi_total)

        # We could set up new div blocks here but it's complicated as it requires <
        # character, so we rely on the existing styling.
        #
        # The data I have has 10034 stacks containing 15533 (obsid,obi)
        # pairs and 15523 obsid values.
        #
        fh.write(f"""
  <text onload="let table = new DataTable('#csc21-status', {{
  dom: 'Blfrtip', pageLength: 25, select: true, buttons: ['colvis', 'copy', 'csv', 'excel']
}});">

    <h1>Processing status of CSC 2.1</h1>
    <div class="qlinkbar">
      <cxclink href="../news.html">What's New?</cxclink> |
      <cxclink href="../caveats.html">Watch Out</cxclink>
    </div>

    <hr/>

    <p>
      This page is updated daily to reflect the current
      status of the CSC 2.1.
      The list of stacks in CSC 2.1 and whether they have completed
      processing is available as the text file:
      <cxclink class="filename" href="stacks-2.1.txt">stacks-2.1.txt</cxclink>.
      The catalog can also be viewed using the
      <cxclink href="../wwt21.html">WorldWide Telescope</cxclink>,
      which lets users select stacks or sources.
    </p>

    <p>
      CSC 2.1 contains {nstack_total} <dictionary id="stack">stacks</dictionary>,
      comprising of {nobi_total} <dictionary id="obi">observation intervals (OBI)</dictionary>.
      There are {nstack_processed} stacks ({nstack_processed_pcen}),
      containing {nobi_processed} observation intervals
      ({nobi_processed_pcen}), that have completed processing
      in CSC 2.1.
    </p>

    <p>
      In the table below the <tt>Stack status</tt> column refers to
      whether the stack is <tt>new</tt> in CSC 2.1,
      <tt>updated</tt> to have more observations than CSC 2.0,
      or is <tt>unchanged</tt> from CSC 2.0.
    </p>

    <table class="csctable" id="csc21-status">
      <caption id="tabular">
        The catalog was last checked at
        <span id="last-update">{lmod_db}</span>.
        See also
        <cxclink class="filename" href="stacks-2.1.txt">stacks-2.1.txt</cxclink>.
      </caption>
      <thead>
        <tr>
          <th>Stack</th>
          <th>Number of OBIs</th>
          <th>Target(s)</th>
          <th>Stack status</th>
          <th>Processing status</th>
          <th>Number of detections</th>
          <th>Completed date</th>
        </tr>
      </thead>
      <tbody>
""")

        for stack in processing:
            sdata = processing[stack]
            state = sdata["state"]

            # we report the number of obis even this array really
            # contains obsids, but it will contain repeats for the
            # few multi-obis we have.
            #
            obis = [obi[0] for obi in all_obis[stack]]
            names = sorted(set([all_names[obi] for obi in obis]))

            nstr = ", ".join(names)

            ra, dec = get_stack_pos(stack)

            fh.write("<tr><td>")
            fh.write(f"<cxclink target='_blank' href='../wwt21.html?stackid={stack}&amp;ra={ra:.5f}&amp;dec={dec:.5f}'>{stack}</cxclink>")
            fh.write("</td>")
            fh.write(f"<td>{len(obis)}</td>")
            fh.write(f"<td>{nstr}</td>")
            fh.write(f"<td>{status[stack]}</td>")
            fh.write(f"<td>{state}</td>")

            if state == "Completed":

                try:
                    nsrc = stack_count[stack]
                except KeyError:
                    nsrc = 0

                fh.write(f'<td data-order="{nsrc}">{nsrc}</td>')

                ival = sdata["completed_int"]
                fh.write(f'<td data-order="{ival}">')
                fh.write(sdata["completed_str"])
            else:
                fh.write('<td data-order="-1">-</td>')
                # Ensure we have a value
                fh.write('<td data-order="0">Not completed')

            fh.write("</td></tr>\n")

        fh.write("""
      </tbody>
    </table>
  </text>
</page>
""")

    print(f"Created: {outfile}")


def write_txt(processing, lmod_db, stack_count):
    """The text status page."""

    indir = Path("ian-2022-02-07")
    status = stackdata.find_stack_status(indir)
    all_obis = stackdata.find_stack_obis(indir)
    outfile = "stacks-2.1.txt"

    with open(outfile, "wt") as fh:

        fh.write(f"""# Last modified: {lmod_db}
#
# stack-status indicates if the stack is new in CSC 2.1
#   (new), has new observations relative to CSC 2.0
#   (updated), or is the same as CSC 2.0 (unchanged).
# num_obi is the number of observation intervals in the
#   stack
# processing-status indicates the state of the CSC 2.1
#   processing and is one of completed, processing, or
#   pending.
# num_det is the number of detections in this stack, or
#   0 if the stack is not completed.
#
# stack num_obi stack-status processing-status num_det date
""")

        for stack in processing:
            sdata = processing[stack]
            state = sdata["state"]

            fh.write(f"{stack} {len(all_obis[stack])} {status[stack]} {state.lower()} ")
            if state == "Completed":
                try:
                    fh.write(str(stack_count[stack]))
                except KeyError:
                    fh.write("0")

                fh.write(" ")
                fh.write(sdata["completed_str"])
            else:
                fh.write("0 ")
                fh.write("n/a")

            fh.write("\n")

    print(f"Created: {outfile}")


def write_sources(source_data,
                  outhead="wwt21_srcprop",
                  chunksize=40000):
    """Chunk up the source data

    Should we reduce the accuracy of the numbers as
    it can probably save a lot of space?

    See
    https://stackoverflow.com/questions/54370322/how-to-limit-the-number-of-float-digits-jsonencoder-produces
    which suggests that over-riding JSONEncoder is surprisingly hard,
    so I'm going with the "direct" manipulation suggested at
    https://stackoverflow.com/a/69056325 which is somewhat more
    dangerous as it "infects" all JSON use. So far it should be okay
    here (as the only two places we write out JSON are here and in the
    status case, which doesn't write out floats).

    Write to wwt21_srcprop.*.json

    """

    ntotal = len(source_data["rows"])

    start = 0
    end = start + chunksize

    ctr = 1

    colorder = source_data["order"]

    print("Starting output: " +
          "nrows={} chunksize={}".format(ntotal, chunksize))
    while start <= ntotal:
        outname = "{}.{}.json".format(outhead, ctr)

        # Use an ordered dict so that we can be sure it serializes
        # the same if the input data is the same. This isn't needed
        # any more, but leave in.
        #
        js = OrderedDict()
        js['ntotal'] = ntotal
        js['start'] = start
        js['cols'] = colorder
        js['rows'] = source_data['rows'][start:end]

        open(outname, 'w').write(json.dumps(js, sort_keys=True,
                                            allow_nan=False))
        print("Created: {}".format(outname))

        start += chunksize
        end += chunksize
        ctr += 1

    # We store the number of chunks so it can be written to the status
    # file.
    #
    source_data["nchunks"] = ctr - 1
    print(f"Number of chunks: {source_data['nchunks']}")


def doit(stackfile):

    infile = Path(stackfile)
    if not infile.is_file():
        raise OSError(f"stackfile={stackfile} does not exist")

    processing, lmod_db = read_status(infile)

    # Try to get the number of sources in each processed stack.
    # This is done later than infile was created so may contain more
    # stacks than infile does. Hopefully it will not contain less.
    #
    stack_count = stackdata.get_stack_numbers()

    # It would be nice to hide those sources we technically don't know
    # about, but let's not worry about that here.
    #
    source_data = stackdata.get_source_properties()

    # This must be called before write_json
    write_sources(source_data)

    write_json(processing, lmod_db, stack_count, source_data)
    write_xml(processing, lmod_db, stack_count)
    write_txt(processing, lmod_db, stack_count)


if __name__ == "__main__":

    nargs = len(sys.argv)
    if nargs == 2:
        stackfile = sys.argv[1]

    elif nargs == 1:
        stackfile = "/home/ascdsops/l3stacks/cat21_stack_status.lis"

    else:
        sys.stderr.write(f"Usage: {sys.argv[0]} [stackfile]\n")
        sys.exit(1)

    doit(stackfile)
    print("Completed make_status.py")
