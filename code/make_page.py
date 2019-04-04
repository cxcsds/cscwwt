#!/bin/env python

"""
Usage:

./make_page.py [log|linear]

Aim:

Creates
  processing_status.xml
    # coverage_pcen.png    NO LONGER GENERATED
    # timeplot.png         DITTO
  stacks.txt
  wwt_status.json

These should be copied to

  /data/da/Docs/cscweb/csc2/

It relies on the data in /data/L3/report_page/completed_ensembles.txt
stacks.pd2.txt, and mw.json

The information in wwt_status.json complements that in
wwt_outlines_base.js, which is static.

The PNG files are no-longer generated because

  a) the times are messed up, which makes the time curve "invalid"
  b) with only 2 (soon to be 1) ensembles left, the sky plot is not
     that useful

"""

import re
import time
import datetime
import json

import urllib.parse
import urllib.request

import numpy as np

import matplotlib as mpl
mpl.use('Agg')

import matplotlib.pyplot as plt
from matplotlib import dates as mdates

from mpl_toolkits.axes_grid1 import make_axes_locatable

from astropy.table import Table


# It is not clear what timezone these times are in
TIMEFORMAT_IN = '%Y-%m-%d %H:%M:%S'
TIMEFORMAT_OUT = '%Y-%m-%d %H:%M'

# Hack for those ensembles with a missing completed time;
# need to consolidate code to avoid need for both time and
# datetime versions (datetime comes from the call to
# mdates.date2num).
#
# Do not bother with the small difference in time (if any)
# between these two constants. Assuming there's no
# time-zone malarky going on.
#
HACK_COMPLETE_TIME = time.localtime()
HACK_COMPLETE_DATETIME = datetime.datetime.now()


def read_template(matches, infile="processing_status.template"):
    """Apply replacement in matches to the content of infile.

    The replacements are basic - i.e. they are not multi-line
    constructs.

    Parameters
    ----------
    matches : seq of (pattern, replacement)
        The replacements to apply. There is no check that they are
        all used.
    infile : str
        The name of the input file

    Returns
    -------
    txt : str
        The replacement text.

    """

    out = []
    with open(infile, 'r') as fh:
        for l in fh.readlines():
            for pat, rpl in matches:
                l = re.sub(pat, str(rpl), l)

            out.append(l)

    return "".join(out)


def read_joe(infile="/data/L3/report_page/completed_ensembles.txt"):
    """Read data from Joe's file.

    Notes
    -----
    Format is assumed to be

    #TEXT/TSV
    ensemble        cohorts num_sources     complete        complete_time
    ens0242400_001  acisfJ1654375p222736_001        5       True    2017-11-05 00:07:15.965574
    ...

    It is now

    #TEXT/TSV
    ensemble        cohorts num_sources     num_detects     complete        complete_time
    ens0242400_001  acisfJ1654375p222736_001        5       5       True    2017-11-05 00:07:15.965574

    """

    nsrc_total = 0
    nsrc_proc = 0
    nstk_total = 0
    nstk_proc = 0
    nens_total = 0
    nens_proc = 0

    lastmod = None

    stack_complete = {}

    need_completed_hack = False

    with open(infile, 'r') as fh:
        for l in fh.readlines():
            l = l.strip()
            if l.startswith('#') or l.startswith('ensemble'):
                continue

            toks = l.split('\t')
            ntoks = len(toks)
            assert ntoks in [5, 6], l

            nsrc = int(toks[2])
            stacks = toks[1].split(',')
            nstk = len(stacks)

            nens_total += 1
            nstk_total += nstk
            nsrc_total += nsrc

            if toks[4] == 'True':

                nens_proc += 1
                nstk_proc += nstk
                nsrc_proc += nsrc

                # There are some ensembles with a missing completed
                # date, which will hopefully be fixed soon, so
                # hack in the current date if this is true.
                #
                if toks[5] == 'None':
                    print("# Missing completion date: " +
                          "{}".format(toks[0]))
                    lmod = HACK_COMPLETE_TIME
                    need_completed_hack = True
                else:
                    # strip off the subsecond resolution as not worth the
                    # effort (may no longer be needed)
                    lmod = time.strptime(toks[5].split('.')[0], TIMEFORMAT_IN)

                if lastmod is None:
                    lastmod = lmod
                elif lmod > lastmod:
                    lastmod = lmod

                lmod_int = int(time.mktime(lmod))
                for stack in stacks:
                    assert stack not in stack_complete
                    stack_complete[stack] = lmod_int

    """
    if not need_completed_hack:
        print("# Note: can remove 'completed_time' hack")
    """

    return {'nsrc': (nsrc_total, nsrc_proc),
            'nstk': (nstk_total, nstk_proc),
            'nens': (nens_total, nens_proc),
            'stack_completed': stack_complete,
            'lastmod': lastmod}


# SHOULD BE AMALGAMATED WITH read_joe
def read_joe2(infile="/data/L3/report_page/completed_ensembles.txt",
              pd2file='stacks.pd2.txt'):
    """Read data from Joe's file."""

    tbl_status = Table.read(infile, format='ascii')
    tbl_stacks = Table.read(pd2file, format='ascii')

    # Probably a nicer way to join things
    #
    ras = []
    decs = []
    done = []

    ras_stacks = tbl_stacks['ra_stk']
    decs_stacks = tbl_stacks['dec_stk']
    ids_stacks = tbl_stacks['stack']

    for row in tbl_status:
        for stack in row['cohorts'].split(','):
            idx, = np.where(ids_stacks == stack)
            assert len(idx) == 1, 'stack: ' + stack

            ras.append(ras_stacks[idx][0])
            decs.append(decs_stacks[idx][0])

            # this ends up just the first character
            done.append(row['complete'][0])

    # RA and Dec are in decimal degrees, so (0,360) and (-90,90)
    #
    ras = np.asarray(ras)
    decs = np.asarray(decs)
    done = np.asarray(done) == 'T'

    # This is not going to get us a %, but blah.
    weights = done * 1.0

    return (ras, decs, done, weights)


def make_stack_table(infile="/data/L3/report_page/completed_ensembles.txt"):
    """Read data from Joe's file.

    Notes
    -----
    Format is assumed to be

    #TEXT/TSV
    ensemble        cohorts num_sources     complete        complete_time
    ens0242400_001  acisfJ1654375p222736_001        5       True    2017-11-05 00:07:15.965574
    ...

    """

    stacks = {}
    with open(infile, 'r') as fh:
        for l in fh.readlines():
            l = l.strip()
            if l.startswith('#') or l.startswith('ensemble'):
                continue

            toks = l.split('\t')
            ntoks = len(toks)
            assert ntoks in [5, 6], l

            finished = toks[4] == 'True'
            for stack in toks[1].split(','):
                assert stack not in stacks, stack
                stacks[stack] = finished

    # Could sort by ra, so acis and hrc are inter-mixed, but for
    # now just go this way

    outfile = 'stacks.txt'
    with open(outfile, 'w') as fh:
        fh.write("# stack processed\n")
        for stack in sorted(list(stacks.keys())):
            flag = stacks[stack]
            fh.write("{} {}\n".format(stack, flag))

    print("Created: {}".format(outfile))


def convert_mw(infile='mw.json'):

    cts = open(infile, 'r').read()
    obj = json.loads(cts)
    assert obj['type'] == 'FeatureCollection'
    for o in obj['features']:
        assert o['type'] == 'Feature'
        assert o['geometry']['type'] == 'MultiPolygon'

    coords = [o['geometry']['coordinates'] for o in obj['features']]
    for c in coords:
        assert len(c) == 1

    # Each element in coords is now a line segment
    coords = [c[0] for c in coords]
    return coords


# Use trial and error to calculate the separation
def mwplot(lvls=None, maxsep=2,
           color='white', alpha=0.6):

    coords = convert_mw()
    for i, features in enumerate(coords):
        if lvls is not None and i not in lvls:
            continue

        for j, coord in enumerate(features):

            coord = np.asarray(coord)
            x = coord[:, 0]
            y = coord[:, 1]

            x[x < 0] += 360

            dx = np.abs(x[1:] - x[:-1])
            idx, = np.where(dx > maxsep)
            start = 0
            for end in idx:
                plt.plot(x[start:end + 1], y[start:end + 1],
                         c=color, alpha=alpha)
                start = end + 1

            plt.plot(x[start:], y[start:],
                     c=color, alpha=alpha)


def plot_stacks(data, lastmod):
    """data is the output of read_joe2"""

    ras, decs, done, weights = data

    lons = np.arange(0, 360 + 1, 15 * 2)
    lats = np.arange(-90, 90 + 1, 15)

    fig = plt.figure(figsize=(9, 5))
    ax = fig.add_subplot(111, aspect='equal')

    # total number of stacks
    nstack, xe, ye = np.histogram2d(ras, decs,
                                    bins=[lons, lats])

    # processed number of stacks
    ndone, _, _ = np.histogram2d(ras, decs,
                                 weights=weights,
                                 bins=[lons, lats])

    # Create the percentage done
    h = 100.0 * ndone / nstack

    # Can I remove the 0-bin bins?
    #
    # note that with the current binning there's no bin with nstack==0
    # h[nstack == 0] = np.nan
    # h[nstack == 0] = 100

    pc = ax.pcolorfast(xe, ye, h.T, vmin=0, vmax=100)

    ax.set_xlim(0, 360)
    ax.set_ylim(-90, 90)

    ax.invert_xaxis()

    # Add the MilkyWay outline before changing the X axis
    mwplot(lvls=[0, 4])

    xvals = np.arange(0, 360, 60)
    xlbls = [x / 15 for x in xvals]
    yvals = np.arange(-90, 91, 30)
    plt.xticks(xvals, xlbls)
    plt.yticks(yvals)

    plt.xlabel(r'Right Ascension ($^h$)')
    plt.ylabel(r'Declination ($^\circ$)')

    plt.title("Processed stacks as of {}".format(lastmod))

    divider = make_axes_locatable(ax)
    cax = divider.append_axes("right", size="5%", pad=0.05)

    cbar = fig.colorbar(pc, cax=cax, ticks=[0, 25, 50, 75, 100])
    cbar.set_clim(0, 100)

    cbar.set_label('stacks completed (%)')

    ofile = 'coverage_pcen.png'
    plt.savefig(ofile)
    print("Created: {}".format(ofile))
    plt.close()


def plot_times(infile="/data/L3/report_page/completed_ensembles.txt",
               ylog=True):

    print("Time plot using log y axis: {}".format(ylog))

    tbl = Table.read(infile, format='ascii')

    mask = tbl['complete'] == 'True'
    masked = tbl[mask]

    dates = masked['complete_time']
    nsrc = masked['num_sources']

    # removal of excess precision (subsecond resolution) may not be
    # needed any more.
    #
    cleantimes = [d.split('.')[0] for d in dates]

    # need to replace None with HACK_COMPLETE_TIME as this may be
    # missing in a few cases (already reported if this is no longer
    # the case)
    #
    def convert(d):
        if d == 'None':
            return HACK_COMPLETE_DATETIME
        else:
            return datetime.datetime.strptime(d, TIMEFORMAT_IN)

    xs = [convert(d) for d in cleantimes]
    xs = mdates.date2num(xs)

    idx = np.argsort(xs)
    xs = xs[idx]
    nsrc = nsrc[idx]

    ys = np.cumsum(nsrc)

    plt.plot_date(xs, ys, fmt='-')
    # plt.ylim(-1000, 300000)
    plt.ylim(100, 500000)

    ymax = 298273
    plt.axhline(ymax)

    # There's probably a built-in formatter for what we want
    def fmt(value, ntick):
        if value == 0:
            return "0"

        ndp = np.floor(np.log10(np.abs(value))).astype(np.int)
        f = value / 10**ndp
        return r"${:.1f} \times 10^{}$".format(f, ndp)

    if ylog:
        plt.yscale('log')
        plt.ylabel("Number of sources")
    else:
        plt.ylim(-10000, 310000)
        yax = plt.gca().yaxis
        yax.set_major_formatter(plt.FuncFormatter(fmt))

        # Must be done this way around to get spacing right
        yax.set_label_position("right")
        plt.ylabel("Number of sources", rotation=270, va='bottom')

    plt.gcf().autofmt_xdate()

    """
    if ylog:
        ofile = 'timeplot.png'
    else:
        ofile = 'timeplot_lin.png'
    """

    ofile = 'timeplot.png'

    plt.savefig(ofile)
    print("Created: {}".format(ofile))
    plt.close()


def find_db_count():
    """Query the catalog for the number of sources and report time."""

    qry = 'SELECT count(1) as total_count from (select DISTINCT m.name FROM master_source m) RESULTS'

    vals = {'version': 'cur', 'outputFormat': 'tsv', 'query': qry}

    # not https yet
    resource = 'http://cda.cfa.harvard.edu/csccli/getProperties'

    params = urllib.parse.urlencode(vals)
    request = urllib.request.Request(resource, params.encode("ascii"))
    request.add_header('User-Agent', 'csc-stats-gatherer/1.0')

    rsp = urllib.request.urlopen(request)
    code = rsp.getcode()
    if code != 200:
        raise IOError("Response to getProperties was {}".format(code))

    cts = rsp.read().decode('ascii').rstrip()
    lines = cts.split('\n')
    if len(lines) != 3 or not lines[0].startswith('#') or \
       lines[1] != 'total_count' or \
                   len(lines[2].strip().split()) != 1:
        raise IOError("Unexpected return value:\n{}\n".format(cts))

    count = int(lines[2].strip())

    # exact time not that important
    now = time.strftime(TIMEFORMAT_OUT)

    return count, now


# use of re.compile is ott here
#
def setup_matches(progname,
                  infile="/data/L3/report_page/completed_ensembles.txt"):
    """Create the replacements based on the data from Joe's report.
    """

    joe = read_joe(infile)

    nsrc = joe['nsrc']
    nstk = joe['nstk']
    nens = joe['nens']

    lastmod = time.strftime(TIMEFORMAT_OUT, joe['lastmod'])

    def report(lbl, vals):
        p = 100.0 * vals[1] / vals[0]
        print("  {:4s}         : ({:6d},{:6d})  {:6.2f}%".format(lbl,
                                                                 vals[0],
                                                                 vals[1],
                                                                 p))

    # now supplement with the current count
    #
    nsrc_db, lastcheck_db = find_db_count()
    nsrc_db_tuple = (nsrc[0], nsrc_db)

    # print("Status:")
    report('ncat', nsrc_db_tuple)  # near top so can see in email
    print("  last modified: {}".format(lastmod))
    report('nsrc', nsrc)
    report('nens', nens)
    report('nstk', nstk)

    # we know the numbers don't line up
    if nsrc_db > nsrc[0]:
        print("\n*** WARNING: sources processed exceeds expected number\n")

    pcen_db = nsrc_db * 100.0 / nsrc[0]

    def pcen(n):
        ntotal, ndone = n
        pcen = int(ndone * 100.0 / ntotal)
        return "{}%".format(pcen)

    return ([(re.compile('PROGNAME'), progname),
             (re.compile('LASTUPDATE'), lastmod),
             (re.compile('LASTCHECKED'), lastcheck_db),
             # (re.compile('NSRC_PROC'), nsrc[1]),
             (re.compile('NSRC_PROC'), nsrc_db),
             (re.compile('NSRC_TOTAL'), nsrc[0]),
             # (re.compile('NSRC_PCEN'), pcen(nsrc)),
             (re.compile('NSRC_PCEN'), pcen(nsrc_db_tuple)),
             (re.compile('NSTK_PROC'), nstk[1]),
            (re.compile('NSTK_TOTAL'), nstk[0]),
             (re.compile('NSTK_PCEN'), pcen(nstk)),
             (re.compile('NENS_PROC'), nens[1]),
             (re.compile('NENS_TOTAL'), nens[0]),
             (re.compile('NENS_PCEN'), pcen(nens))
         ], nsrc_db, pcen_db, lastcheck_db)


# repeat work done previously
def read_stacks(infile):
    """Read in stacks.pd2.txt"""

    stacks = {}
    with open(infile, 'r') as fh:
        for l in fh.readlines():
            l = l.strip()
            if l == '' or l.startswith('#'):
                continue

            toks = l.split()
            assert len(toks) == 2, l
            assert toks[1] in ['True', 'False'], l
            assert toks[0] not in stacks, l

            stacks[toks[0]] = toks[1] == 'True'

    return stacks


# DEPRECATED; left in for reference
def convert_json(stackfile, joefile, templatefile, outfile):

    stacks = read_stacks(stackfile)
    joe = read_joe(joefile)

    with open(templatefile, 'r') as fh:
        with open(outfile, 'w') as ofh:
            for l in fh.readlines():
                l = l.strip()

                # TODO - also update LASTMODIFIED

                start = l.find('"PROCSTATUS_')
                lmod = l.find('"LASTUPDATE"')

                if start == -1 and lmod == -1:
                    ofh.write(l + "\n")
                    continue

                if start > -1:
                    end = l.find('",', start)
                    assert end > 0

                    left = l[:start]
                    right = l[end + 1:]

                    stack = l[start + 12:end]
                    assert stack in stacks

                    if stacks[stack]:
                        lbl = 'true'
                    else:
                        lbl = 'false'

                    ofh.write("{}{}{}\n".format(left, lbl, right))

                elif lmod > -1:
                    left = l[:lmod]
                    right = l[lmod + 12:]

                    lastmod = time.strftime(TIMEFORMAT_OUT,
                                            joe['lastmod'])
                    ofh.write('{}"{}"{}\n'.format(left,
                                                  lastmod,
                                                  right))

    print("Created: {}".format(outfile))


def make_status_json(stackfile, joefile, nsrc, pcen, lastmod_db,
                     outfile):
    """Create a JSON file listing the current status.

    JSON is

    {'lastupdate': 'string value',
     'srcs_proc': number-of-processed-sources,
     'srcs_pcen': percentage (to 1 dp),
     'stacks': {'acisf...': bool, ...}}

    TODO: store the "processed" date as well as the status,
    if available.

    """

    stacks = read_stacks(stackfile)
    joe = read_joe(joefile)

    if pcen > 100.0:
        pcen = 100.0

    # Ideally stack status and completed would be in the same structure,
    # but less invasive this way (for downstream code)
    #
    out = {'lastupdate': time.strftime(TIMEFORMAT_OUT,
                                       joe['lastmod']),
           'lastupdate_db': lastmod_db,
           'srcs_proc': nsrc,
           'srcs_pcen': '{:.1f}'.format(pcen),
           'stacks': {},
           'completed': {}}

    for stack, status in stacks.items():
        assert stack not in out['stacks']
        out['stacks'][stack] = status
        if status:
            out['completed'][stack] = joe['stack_completed'][stack]

    txt = json.dumps(out)
    open(outfile, 'w').write(txt)
    print("Created: {}".format(outfile))


def doit(progname, yscale='linear'):

    matches, nsrc_db, pcen_db, lastmod_db = setup_matches(progname)
    tmpl = read_template(matches)

    oxml = 'processing_status.xml'
    with open(oxml, 'w') as fh:
        fh.write(tmpl + '\n')

    print('Created: {}'.format(oxml))

    make_stack_table()

    # HAS TO BE DONE AFTER make_stack_table
    make_status_json('stacks.txt',
                     '/data/L3/report_page/completed_ensembles.txt',
                     nsrc_db, pcen_db, lastmod_db,
                     'wwt_status.json')

    data = read_joe2()

    """

    No longer create .png files

    # HARD CODE KNOWLEDGE OF matches ARRAY
    plot_stacks(data, matches[1][1])

    ylog = yscale == 'log'
    plot_times(ylog=ylog)

    """


def usage(progname):

    sys.stderr.write("Usage: {} [log|linear]\n".format(progname))
    sys.exit(1)


if __name__ == "__main__":

    import os
    import sys

    if len(sys.argv) > 2:
        usage(sys.argv[0])

    yscale = 'log'
    if len(sys.argv) == 2:
        yscale = sys.argv[1]
        if yscale not in ['log', 'linear']:
            usage(sys.argv[0])

    progname = os.path.abspath(sys.argv[0])
    doit(progname, yscale=yscale)
