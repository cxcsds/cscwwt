#!/usr/bin/env python

"""
Test a cone-search like query.

This drops the radius search, just a mark-and-sweep min/max check.


The following fails on the dbo.cone_distance segment of the query

curl --request POST \
  --location \
  --data REQUEST=doQuery \
  --data PHASE=RUN \
  --data FORMAT=votable \
  --data LANG=ADQL \
  --data 'QUERY=SELECT m.name FROM csc21.master_source m WHERE ((m.dec BETWEEN 27.97 AND 27.990000000000002) AND (m.ra BETWEEN 194.94 AND 194.95999999999998) AND dbo.cone_distance(m.ra,m.dec,194.95,27.98) <= 0.01)' \
  https://cda.cfa.harvard.edu/csc21tap/sync

The example we have is:

WHERE
  ((( ( m.dec BETWEEN 12.374454815683332 AND 12.407788149016667 ) AND
      ( m.ra BETWEEN 187.6888716832049 AND 187.72300001759513 ) ) AND
      dbo.cone_distance(m.ra,m.dec,187.7059358504,12.39112148235) <= 1.0
  ))

So r is in arcmin and the ra limits are  ra +- (r / 60 / cos(dec))

"""

from math import cos, pi
from urllib import parse, request


BASE_URL = "https://cda.cfa.harvard.edu/csc21tap/sync"


def doit(ra0, dec0, rad):
    """Ra and dec are in decimal degrees and rad is in arcmin."""

    if rad <= 0:
        raise ValueError("radius must be positive")

    if (dec0 < -90) or (dec0 > 90):
        raise ValueError("dec must be -90 to 90")

    if (ra0 < 0) or (ra0 > 360):
        raise ValueError("ra must be 0 to 360")

    if (rad <= 0) or (rad >= 180):
        raise ValueError("radius must be 0 to 180 (exclusive)")

    # How do we set up the pre-filter.
    #
    rad /= 60.0
    dmin = dec0 - rad
    dmax = dec0 + rad
    if dmin < -90:
        dmin = -90.0
    if dmax > 90:
        dmax = 90.0

    sfilt = f"(m.dec BETWEEN {dmin} AND {dmax}) AND "

    rad /= cos(dec0 * pi / 180)
    rmin = ra0 - rad
    rmax = ra0 + rad
    if rmin >= 0 and rmax <= 360:
        sfilt += f"(m.ra BETWEEN {rmin} AND {rmax})"
    elif rmin < 0:
        rmin = 360 + rmin
        sfilt += f"((m.ra BETWEEN 0 AND {rmax}) OR " + \
            f"(m.ra BETWEEN {rmin} AND 360))"
    else:
        rmax = rmax - 360
        sfilt += f"((m.ra BETWEEN {rmin} AND 360) OR " + \
            f"(m.ra BETWEEN 0 AND {rmax}))"

    # How best to do a cone search?
    #
    # sfilt += " AND dbo.cone_distance(m.ra,m.dec,"
    # sfilt += f"{ra0},{dec0}) <= {rad}"

    cols = ["m.name", "m.ra", "m.dec",
            "m.err_ellipse_r0", "m.err_ellipse_r1", "m.err_ellipse_ang",
            "m.conf_flag", "m.sat_src_flag",
            "m.acis_num", "m.hrc_num",
            "m.var_flag", "m.significance",
            "m.flux_aper_b", "m.flux_aper_lolim_b", "m.flux_aper_hilim_b",
            "m.flux_aper_w", "m.flux_aper_lolim_w", "m.flux_aper_hilim_w",
            "m.nh_gal",
            "m.hard_hm", "m.hard_hm_lolim", "m.hard_hm_hilim",
            "m.hard_ms", "m.hard_ms_lolim", "m.hard_ms_hilim"
            ]
    colnames = ",".join(cols)

    args = {
        "REQUEST": "doQuery",
        "PHASE": "RUN",
        "FORMAT": "votable",
        "LANG": "ADQL",
        "QUERY": f"SELECT {colnames} FROM csc21.master_source m WHERE ({sfilt})"
    }

    data = parse.urlencode(args)
    req = request.Request(BASE_URL, data=data.encode(), method='POST')
    with request.urlopen(req) as resp:
        got = resp.read().decode()
        print(got)



if __name__ == "__main__":

    import sys
    if len(sys.argv) != 4:
        sys.stderr.write(f"Usage: {sys.argv[0]} ra dec radius\n")
        sys.exit(1)

    doit(float(sys.argv[1]),
         float(sys.argv[2]),
         float(sys.argv[3]))
