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

    wwt21_status.json
    processing_status_2.1.xml
    stacks-2.1.txt

"""

from pathlib import Path
import json
import sys
import time

import stackdata


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
            store["completed_int"] = get_time(toks[2])

        out[stack] = store

    # get the last-modified date from the file
    lmod = time.localtime(infile.lstat().st_mtime)
    lmod_txt = time.strftime("%Y-%m-%d %H:%M", lmod)

    return out, lmod_txt


def write_json(processing, lmod_db):

    out = {"stacks": {}, "completed": {}}
    for stack in processing:

        assert stack not in out["stacks"]
        sdata = processing[stack]
        state = sdata["state"]
        if state == "Completed":
            out["stacks"][stack] = True
            out["completed"][stack] = sdata["completed_int"]

        elif state in ["Pending", "Processing"]:
            out["stacks"][stack] = False

        else:
            raise ValueError(f"Unexpected line: {l}")

    # For now use UTC
    lmod = time.gmtime()
    txt = time.strftime("%Y-%m-%d %H:%M", lmod)
    out["lastupdate"] = txt

    out["lastupdate_db"] = lmod_db

    outfile = "wwt21_status.json"
    with open(outfile, "wt") as fh:
        fh.write(json.dumps(out))

    print(f"Created: {outfile}")


def write_xml(processing, lmod_db):
    """The XML status page."""

    indir = Path("ian-2022-02-07")
    status = stackdata.find_stack_status(indir)
    all_obis = stackdata.find_stack_obis(indir)
    all_names = stackdata.read_cxc_targetnames()
    outfile = "processing_status_2.1.xml"

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
      <htmlscript src="https://cdn.datatables.net/v/dt/jq-3.6.0/dt-1.12.1/datatables.min.js"/>
    </htmlscripts>

    <css src="https://cdn.datatables.net/v/dt/jq-3.6.0/dt-1.12.1/datatables.min.css"/>

""")

        # As about to write CSS, and hence lots of { } pairs,
        # easier to do not in a f-string
        fh.write("""
    <css>
h1 { text-align: center; }
td { text-align: center; }
.qlinkbar { text-align: center; }

.filename { font-family: monospace; }

.caption {
  text-align: center;
}

    </css>
  </info>
""")

        fh.write(f"""
  <text onload="let table = new DataTable('#csc21-status', {{ pageLength: 25 }});">

    <h1>Processing status of CSC 2.1</h1>
    <div class="qlinkbar">
      <cxclink href="../news.html">What's New?</cxclink> |
      <cxclink href="../caveats.html">Watch Out</cxclink>
    </div>

    <hr/>

    <p>
      This page is periodically updated to reflect the current
      status of the CSC 2.1.
      The list of stacks in CSC 2.1 and whether they have been
      fully processed is available as the text file:
      <cxclink class="filename" href="stacks-2.1.txt">stacks-2.1.txt</cxclink>.
      The catalog can also be viewed using the
      <cxclink href="../wwt21.html">WorldWide Telescope</cxclink>,
      which lets users select stacks or sources.
    </p>

    <p>
      In the table below the <tt>Stack status</tt> column refers to
      whether the stack is:
    </p>

    <dl>
        <dt><tt>new</tt></dt>
        <dd>New in CSC 2.1.</dd>

        <dt><tt>updated</tt></dt>
        <dd>Has extra observations compared to CSC 2.0.</dd>

        <dt><tt>unchanged</tt></dt>
        <dd>Has the same set of observations as CSC 2.0.</dd>

    </dl>

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
          <th>Number of observations</th>
          <th>Target(s)</th>
          <th>Stack status</th>
          <th>Processing status</th>
          <th>Completed date</th>
        </tr>
      </thead>
      <tbody>
""")

        for stack in processing:
            sdata = processing[stack]
            state = sdata["state"]

            obis = [obi[0] for obi in all_obis[stack]]
            names = set([all_names[obi] for obi in obis])

            nstr = ", ".join(names)

            ra, dec = get_stack_pos(stack)

            fh.write("<tr><td>")
            fh.write(f"<cxclink href='../wwt21.html?stackid={stack}&amp;ra={ra:.5f}&amp;dec={dec:.5f}'>{stack}</cxclink>")
            fh.write("</td>")
            fh.write(f"<td>{len(obis)}</td>")  # note: could use len(set(obis))
            fh.write(f"<td>{nstr}</td>")
            fh.write(f"<td>{status[stack]}</td>")
            fh.write(f"<td>{state}</td><td")
            if state == "Completed":
                ival = sdata["completed_int"]
                fh.write(f' data-order="{ival}">')
                fh.write(sdata["completed_str"])
            else:
                # Ensure we have a value
                fh.write(' data-order="0">Not completed')

            fh.write("</td></tr>\n")

        fh.write("""
      </tbody>
    </table>
  </text>
</page>
""")

    print(f"Created: {outfile}")


def write_txt(processing, lmod_db):
    """The text status page."""

    status = stackdata.find_stack_status(Path("ian-2022-02-07"))
    outfile = "stacks-2.1.txt"

    with open(outfile, "wt") as fh:

        fh.write(f"""# Last modified: {lmod_db}
#
# stack-status indicates if the stack is new in CSC 2.1
#   (new), has new observations relative to CSC 2.0
#   (updated), or is the same as CSC 2.0 (unchanged).
# processing-status indicates the state of the CSC 2.1
#   processing and is one of completed, processing, or
#   pending.
#
# stack stack-status processing-status date
""")

        for stack in processing:
            sdata = processing[stack]
            state = sdata["state"]

            fh.write(f"{stack} {status[stack]} {state.lower()} ")
            if state == "Completed":
                fh.write(sdata["completed_str"])
            else:
                fh.write("n/a")

            fh.write("\n")

    print(f"Created: {outfile}")


def doit(stackfile):

    infile = Path(stackfile)
    if not infile.is_file():
        raise OSError(f"stackfile={stackfile} does not exist")

    processing, lmod_db = read_status(infile)

    write_json(processing, lmod_db)
    write_xml(processing, lmod_db)
    write_txt(processing, lmod_db)


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
