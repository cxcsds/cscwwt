#!/usr/bin/env python

"""

Usage:

  propsjson.py pre1 infile outhead

Aim:

Convert a TSV file - created by CSC2 ADQL query - to JSON format.
The output is re-ordered to match that given by pre1, which is
the preliminary release list (FITS format).

THE ADQL query is required to contain a NAME field of some sort.

The flux_aper_w and flux_aper_b fluxes (and errors) are merged
into flux_aper and band (since both can not be set at the same
time as it is the "best" flux estimate). This should save some space.

Since the output is quite large (for web purposes), it is broken
up into chunks of x rows per file. So the output is

  outhead.1.json
  outhead.2.json
  outhead.3.json
  outhead.4.json
  ...

Perhaps should take a list of to-be-completed stacks, so we can identify
those sources from the preliminary list we are missing data (so copy
over ra/dec). This way we avoid having to do matches.

RA and Dec are limited to 4 and 5 decimal places, to save some space
(this should be sub-arcsecond accuracy). This saves less than 1% space
so actually don't do it.

"""


import json
# import math

from collections import OrderedDict


try:
    import pycrates
    fileio = 'pycrates'
except ImportError:
    from astropy.table import Table
    fileio = 'astropy'


def roundy(v, n):
    """Restrict to n decimal places.

    Up to the vagueris of floating-point representation.

    And have decided not to do this, so it just returns the
    input value.
    """

    """
    t = 10**n
    return math.floor(v * t + 0.5) / t
    """

    return v


def unitify(unitstr):
    """Try and clean up the units string"""

    # Not sure of the encoding rules
    if unitstr.startswith('["'):
        unitstr = unitstr[2:]

    if unitstr.endswith(']"'):
        unitstr = unitstr[:-2]

    unitstr = unitstr.strip()
    if unitstr == '':
        return None
    else:
        return unitstr


def get_colinfo(l):
    """Parse the header line."""

    if not l.startswith('#Column\t'):
        raise ValueError('Header line')

    toks = l.split('\t')
    assert len(toks) == 7

    # Not convinced about this check; it would be nice to add
    # boolean too, but not clear that is easily determined
    #
    assert (toks[2].startswith('(') and toks[2].endswith(')'))
    dchar = toks[2][1]
    if dchar == 'A':
        dtype = 'string'
    elif dchar not in "EFG":
        dtype = 'integer'
    else:
        dtype = 'float'

    out = {'name': toks[1],
           'datatype': dtype,
           'description': toks[3]}

    units = unitify(toks[5])
    if units is not None:
        out['units'] = units

    return out


_nmiss = 1


def update_store(store, converters, ncols, l, pre):
    """Add the column data to the store.

    There is limited type conversion:
       string
       number

    Use TSV values rather than those in pre; actually, at present the
    only thing pre is used for is an existance check (that the
    pre-release knows about this source).

    Special case handling for flux_aper_[b/w] and the _lolim/_hilim
    variants.
    """

    global _nmiss

    toks = l.split('\t')
    assert len(toks) == ncols, (len(toks), ncols, l)

    rowdata = dict(list(zip(store['order'], toks)))
    name = rowdata['name'].strip()

    if name not in pre:
        print("[{}] Source {} not in ".format(_nmiss, name) +
              "prerelease list")
        _nmiss += 1

    # row = {}
    row = []

    # need to "down convert" the fluxes
    rowdata = dict(list(zip(store['order'], toks)))

    fb = rowdata['flux_aper_b'].strip()
    fw = rowdata['flux_aper_w'].strip()
    if fb != '' and fw != '':
        print("WARNING: {} has fb=[{}] fw=[{}]".format(name,
                                                       fb,
                                                       fw))

    # extract flux values here, not in loop
    if fb != '':
        band = 'broad'
        flux = rowdata['flux_aper_b']
        fluxlo = rowdata['flux_aper_lolim_b']
        fluxhi = rowdata['flux_aper_hilim_b']
    elif fw != '':
        band = 'wide'
        flux = rowdata['flux_aper_w']
        fluxlo = rowdata['flux_aper_lolim_w']
        fluxhi = rowdata['flux_aper_hilim_w']
    else:
        band = ''
        flux = ''
        fluxlo = ''
        fluxhi = ''

    flux = convert_to_float(flux)
    fluxlo = convert_to_float(fluxlo)
    fluxhi = convert_to_float(fluxhi)

    for col, val in zip(store['order'], toks):
        assert col not in row

        # Need to handle conversion of flux values
        if col == 'flux_aper_b':
            row.extend([band, flux, fluxlo, fluxhi])

        if col.startswith('flux_aper'):
            continue

        try:
            val = converters[col](val)
        except ValueError:
            print("Unable to convert '{}'".format(val))

        if col == 'ra':
            val = roundy(val, 4)
        elif col == 'dec':
            val = roundy(val, 5)

        # row[col] = val
        row.append(val)

    store['rows'].append(row)


def add_unprocessed_sources(store, pre):
    """Add in basic information for sources that have not been
    processed yet.

    """

    print("Looking for unprocessed sources")

    nameidx = store['order'].index('name')
    if nameidx == -1:
        raise IOError("No name field!")

    # Hoping that set checking is faster than list checking
    # already_seen = set([row['name'] for row in store['rows']])
    already_seen = set([row[nameidx] for row in store['rows']])
    pre_names = set(pre.keys())

    # Check there's no repeats
    assert len(already_seen) == len(store['rows'])
    assert len(pre_names) == len(pre)

    # The names were not meant to change, but they did for one
    # source, so exclude that one from the error reporting.
    #
    # The key is the new name and the value the pre-release name
    renames = {'2CXO J200718.6-482145': '2CXO J200718.6-482146'}

    for (newname, oldname) in renames.items():
        assert newname not in pre_names, newname
        assert oldname not in already_seen, oldname

        pre_names.remove(oldname)
        pre_names.add(newname)

    print("already_seen = {}".format(len(already_seen)))
    print("pre names    = {}".format(len(pre_names)))

    # Try and ensure deterministic output
    todo = sorted(list(pre_names.difference(already_seen)))
    print("todo         = {}".format(len(todo)))

    newnames = sorted(list(already_seen.difference(pre_names)))
    print(" <new sources> = {}".format(len(newnames)))

    nmiss = 0
    for name in todo:
        print(" - missing {}".format(name))
        srcdata = pre[name]

        nmiss += 1
        # row = {}
        row = []
        for col in store['order']:
            assert col not in row

            # handle conversion to flux
            if col == 'flux_aper_b':
                row.extend(['', None, None, None])

            if col.startswith('flux_aper'):
                continue

            if col in srcdata:
                val = srcdata[col]

                if col == 'ra':
                    val = roundy(val, 4)
                elif col == 'dec':
                    val = roundy(val, 5)

            else:
                val = None

            # row[col] = val
            row.append(val)

        store['rows'].append(row)

    print("There are {} unprocessed sources".format(nmiss))


def convert_to_int(v):
    v = v.strip()
    if v == '':
        return -999
    return int(v)


def convert_to_float(v):
    v = v.strip()
    if v == '':
        # return math.nan
        return None
    return float(v)


def make_converter(dtype):

    # The spaces may be important in the strings, bit don't think
    # they are for my use case, so remove them.
    #
    if dtype == 'string':
        return lambda v: v.strip()
    elif dtype == 'integer':
        return convert_to_int
    elif dtype == 'float':
        return convert_to_float
    else:
        raise ValueError(dtype)


def read_tsv(infile, pre):
    """Convert to a dictionary, storing lists.

    Prefer the TSV values to the pre-release ones.
    """

    store = {'metadata': {}, 'rows': [], 'order': []}
    in_header = True
    ncols = None
    converters = {}

    with open(infile, 'r') as fh:
        for l in fh.readlines():

            # Just want to remove the trailing '\n', not any
            # trailing whitespace, since this has meaning here
            # for the data columns.
            #
            # l = l.strip()
            assert l[-1] == '\n'
            l = l[:-1]

            if l.startswith('#'):
                if not in_header:
                    raise ValueError("Expected data, found header")

                hdr = get_colinfo(l)
                name = hdr['name']

                assert name not in store['metadata']
                store['metadata'][name] = hdr
                store['order'].append(name)
                converters[name] = make_converter(hdr['datatype'])
                continue

            if in_header:
                expected = '\t'.join(store['order'])
                assert expected == l, \
                    "expected={}\n     got={}".format(expected, l)
                in_header = False
                ncols = len(store['order'])
                continue

            update_store(store, converters, ncols, l, pre)

    add_unprocessed_sources(store, pre)
    return store


def read_srclist(infile):

    if fileio == 'pycrates':
        return read_srclist_crates(infile)
    elif fileio == 'astropy':
        return read_srclist_astropy(infile)
    else:
        raise IOError("Unexpected fileio={}".format(fileio))


def read_srclist_crates(infile):
    """Read in the pre-release list

    Only trust a minimal selection from this list.
    """

    # only read in the columns we care about, because the file is
    # quite large (due to the space/column names) which we do not
    # need.
    #
    fname = "{}[cols NAME,RA,DEC,ERR_ELLIPSE_R0]".format(infile)
    cr = pycrates.read_file(fname)
    out = {}

    # copies are a desperate/ineffectual attempt to save some memory
    for name, ra, dec, r0 in zip(cr.NAME.values.copy(),
                                 cr.RA.values.copy(),
                                 cr.DEC.values.copy(),
                                 cr.ERR_ELLIPSE_R0.values.copy()):

        # SHOULD we strip the name?
        name = str(name)
        assert name not in out
        out[name] = {'name': name, 'ra': ra, 'dec': dec,
                     'err_ellipse_r0': r0}

    return out


def read_srclist_astropy(infile):
    """Read in the pre-release list

    Only trust a minimal selection from this list.
    """

    # The file has been pre-filtered
    tbl = Table.read(infile)
    assert tbl.colnames == ['NAME', 'RA', 'DEC',
                            'ERR_ELLIPSE_R0'], tbl.colnames

    out = {}
    for row in tbl:

        name = row['NAME']
        ra = row['RA']
        dec = row['DEC']
        r0 = row['ERR_ELLIPSE_R0']

        name = str(name).strip()
        assert name not in out
        out[name] = {'name': name, 'ra': ra, 'dec': dec,
                     'err_ellipse_r0': r0}

    return out


def convert(srcfile, infile, outhead, chunksize):

    pre = read_srclist(srcfile)
    cts = read_tsv(infile, pre)

    # ASSUME there is a name field
    ntotal = len(cts['rows'])
    start = 0
    end = start + chunksize

    ctr = 1

    # Convert column order to handle flux conversion
    #
    colorder = []
    for col in cts['order']:
        if col == 'flux_aper_b':
            colorder.extend(['fluxband', 'flux',
                             'flux_lolim', 'flux_hilim'])
        if col.startswith('flux_aper'):
            continue

        colorder.append(col)

    print("Starting output: " +
          "nrows={} chunksize={}".format(ntotal, chunksize))
    while start <= ntotal:
        outname = "{}.{}.json".format(outhead, ctr)

        # Use an ordered dict so that we can be sure it serializes
        # the same if the input data is the same
        #
        js = OrderedDict()
        js['ntotal'] = ntotal
        js['start'] = start
        js['cols'] = colorder
        js['rows'] = cts['rows'][start:end]

        open(outname, 'w').write(json.dumps(js, allow_nan=False))
        print("Created: {}".format(outname))

        start += chunksize
        end += chunksize
        ctr += 1


if __name__ == '__main__':

    import sys
    if len(sys.argv) != 4:
        sys.stderr.write("Usage: {} ".format(sys.argv[0]) +
                         "prerel tsvfile outhead\n")
        sys.exit(1)

    convert(sys.argv[1], sys.argv[2], sys.argv[3], 40000)
