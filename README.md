
Code used to create the CSC2 visualization using WWT.

The output is visible at http://cxc.harvard.edu/csc2/wwt.html

Author: Doug Burke for the Chandra X-ray Center


## How to update the version numbers for a file type

At present the WWT interface uses a lookup table to find the version
number of a file (e.g. event file or exposure map), rather than querying
it when needed. This is because

a) the version numbers are only expected to change slowly during development
   and not once the release has been finalised, so downloading a small file
   rather than querying the CSCCLI is likely to improve the user
   experience

b) there is currently no CORS support for the CSCCLI, so I can't call it,
   and I don't want to create a service to work around this limitation.

### To update all data types at once

```
% python code/get_stack_names_all.py code/stacks.pd2.txt
No stkbkgimg data for stacks: ['acisfJ0040431m111007_001']
No stkexpmap data for stacks: ['acisfJ0040431m111007_001']
No sensity data for stacks: ['acisfJ0040431m111007_001']
No stkevt3 data for stacks: ['acisfJ0040431m111007_001']
No stkecorrimg data for stacks: ['acisfJ0040431m111007_001']
...
No stkbkgimg data for stacks: ['acisfJ1948009p413104_001']
No stkexpmap data for stacks: ['acisfJ1948009p413104_001']
No sensity data for stacks: ['acisfJ1948009p413104_001']
No stkevt3 data for stacks: ['acisfJ1948009p413104_001']
No stkecorrimg data for stacks: ['acisfJ1948009p413104_001']
No stkbkgimg data for stacks: ['acisfJ2154551m305657_001']
No stkexpmap data for stacks: ['acisfJ2154551m305657_001']
No sensity data for stacks: ['acisfJ2154551m305657_001']
No stkevt3 data for stacks: ['acisfJ2154551m305657_001']
No stkecorrimg data for stacks: ['acisfJ2154551m305657_001']

Created: version20.stkbkgimg
Created: version20.stkexpmap
Created: version20.sensity
Created: version20.stkevt3
Created: version20.stkecorrimg
1.578u 0.539s 2:03:55.67 0.0%	0+0k 0+14904io 0pf+0w
```

Saved the output of "no ... data for stacks" to missing.lis - looks like
only one stack per line

```
% grep stkevt3 missing.lis | wc -l
25
% grep stkecorr missing.lis | wc -l
25
```

```
% grep stkecorr missing.lis
No stkecorrimg data for stacks: ['acisfJ0040431m111007_001']
No stkecorrimg data for stacks: ['acisfJ0629306p720429_001']
No stkecorrimg data for stacks: ['acisfJ0738192p275012_001']
No stkecorrimg data for stacks: ['acisfJ0800324p291241_001']
No stkecorrimg data for stacks: ['acisfJ0819386m132201_001']
No stkecorrimg data for stacks: ['acisfJ0827232p032750_001']
No stkecorrimg data for stacks: ['acisfJ0834477p392852_001']
No stkecorrimg data for stacks: ['acisfJ0953284p562657_001']
No stkecorrimg data for stacks: ['acisfJ1010174p000317_001']
No stkecorrimg data for stacks: ['acisfJ1047561p073934_001']
No stkecorrimg data for stacks: ['acisfJ1057540p482505_001']
No stkecorrimg data for stacks: ['acisfJ1134131p001050_001']
No stkecorrimg data for stacks: ['acisfJ1143457p550019_001']
No stkecorrimg data for stacks: ['acisfJ1321290p481720_001']
No stkecorrimg data for stacks: ['acisfJ1407103p241904_001']
No stkecorrimg data for stacks: ['acisfJ1440528m023524_001']
No stkecorrimg data for stacks: ['acisfJ1532006p370001_001']
No stkecorrimg data for stacks: ['acisfJ1536551p312255_001']
No stkecorrimg data for stacks: ['acisfJ1704286m253526_001']
No stkecorrimg data for stacks: ['acisfJ1739318m294142_001']
No stkecorrimg data for stacks: ['acisfJ1749121m263831_001']
No stkecorrimg data for stacks: ['acisfJ1749508m331158_001']
No stkecorrimg data for stacks: ['acisfJ1759117m344927_001']
No stkecorrimg data for stacks: ['acisfJ1948009p413104_001']
No stkecorrimg data for stacks: ['acisfJ2154551m305657_001']
```

```
foreach option ( stkevt3 stkecorrimg stkbkgimg stkexpmap sensity )
  set out = version20.${option}.json
  if ( -e $out ) rm $out
  python code/parse_stack_names.py $option version.$option > $out
end
Version breakdown
  version=  20  count= 7173
  version=  21  count= 88
  version=  28  count= 1
Version breakdown
  version=  20  count= 7173
  version=  21  count= 88
  version=  28  count= 1
Version breakdown
  version=  20  count= 7173
  version=  21  count= 88
  version=  28  count= 1
Version breakdown
  version=  24  count= 3997
  version=  25  count= 897
  version=  23  count= 744
  version=  26  count= 648
  version=  27  count= 454
  version=  28  count= 431
  version=  29  count= 34
  version=  31  count= 25
  version=  30  count= 20
  version=  32  count= 12
Version breakdown
  version=  22  count= 7170
  version=  23  count= 92
```

### To update a single "data type" (aka OPTION)

```
% python code/get_stack_names.py code/stacks.pd2.txt OPTION > version20.OPTION
% python code/parse_stack_names.py OPTION version.OPTION > version20.OPTION.json
Version breakdown
  version=  24  count= 3997
  version=  25  count= 896
  version=  23  count= 744
  version=  26  count= 648
  version=  27  count= 454
  version=  28  count= 431
  version=  29  count= 34
  version=  31  count= 24
  version=  30  count= 21
  version=  32  count= 12
```

where OPTION is one of

    stkevt3
    stkecorrimg
    stkbkgimg
    stkexpmap
    sensity


The get_stack_names code now chunks code up (but could use ~ 4 times
larger chunks I think), to reduce run time. It had changed an hour process
into a 6-minute one, but that was before the release and it now seems
to be really slow.

### And then

The screen output of parse_stack_names provides information on how the
version numbers are distributed. This is partly relevant because missing
files - that is, those that the CSCCLI doesn't report information in because
there are no sources in the stack and this means the CSCCLI doesn't "find"
them - are given a default version (matching either the smallest version or
the version with the most matches).

The version20.OPTION.json is then copied to /data/da/Docs/cscweb/csc2/wwtdata/
and published to the test and/or live site.

## CSC data

For 2.0 we have

| Filename               | Script                   |
| ---------------------- | ------------------------ |
| `wwt_outlines_base.js` | ???                      |
| `wwt_obis.js`          | `code/make_obi_list.py`  |
| `wwt_names.js`         | `code/make_obi_names.py` |

We used to also create `wwt_status.json` which was used to indicate the
processing state and was created through `code/make_page.py`

These have now been renamed `wwt20_xxx` from `wwt_xxx` to make it
easier to have different versions around.

## `wwt_obis.js`

This is a mapping between stack name and obi:

```
% head -5 wwt_obis.js
var obi_map = {
"acisfJ1700532m421048_001": ["08237_000"]
,"acisfJ0834591p553527_001": ["01645_000"]
,"acisfJ1224550p114231_001": ["08040_000"]
,"acisfJ2133150m425428_001": ["06853_000"]
```

```
% grep hrcfJ0045199p414949 wwt_obis.js
,"hrcfJ0045199p414949_001": ["00294_002","00295_000","00296_000","00297_000","00299_000","00300_000","00301_000","00302_000","01573_000","01574_000","02911_000","02912_000","02914_000"]
```

## `wwt_names.js`

This is a mapping between stack name and identifier (as used by the original
proposer, so is now out of date thanks to the updates by the CDA team).

```
% head -5 wwt_names.js
var stack_name_map = {
"acisfJ1700532m421048_001": ["AX J170052-4210"]
,"acisfJ0834591p553527_001": ["4C55.16"]
,"acisfJ1224550p114231_001": ["759"]
,"acisfJ2133150m425428_001": ["Q2130-431"]
```

```
% grep hrcfJ0045199p414949 wwt_names.js
,"hrcfJ0045199p414949_001": ["M31-N2","M31 - NORTH 2"]
```

## `wwt_outlines_base.js`

This provides information about the stacks, including the outline
data. It should probably have been split into several files.

```
% head wwt_outlines_base.js
var outlines = {
"stacks": [
{"stackid": "acisfJ1139516m315920_001",
 "nobs": 3,
 "description": "The stack contains 3 ACIS observations",
 "polygons": [
[
[
[174.924368,-31.699083]
,[174.924324,-31.699087]
```

We should be able to auto-generate the description field, as we now all
the information needed to generate this.

```
% grep description wwt_outlines_base.js | sort | uniq -c
      8  "description": "The stack contains 10 ACIS observations",
      4  "description": "The stack contains 10 HRC observations",
      8  "description": "The stack contains 11 ACIS observations",
      2  "description": "The stack contains 11 HRC observations",
      5  "description": "The stack contains 12 ACIS observations",
      3  "description": "The stack contains 13 ACIS observations",
      2  "description": "The stack contains 13 HRC observations",
      1  "description": "The stack contains 14 HRC observations",
      3  "description": "The stack contains 15 ACIS observations",
      1  "description": "The stack contains 15 HRC observations",
      1  "description": "The stack contains 16 ACIS observations",
      3  "description": "The stack contains 16 HRC observations",
      1  "description": "The stack contains 17 ACIS observations",
      1  "description": "The stack contains 17 HRC observations",
      1  "description": "The stack contains 19 ACIS observations",
      1  "description": "The stack contains 19 HRC observations",
      1  "description": "The stack contains 20 ACIS observations",
      1  "description": "The stack contains 21 ACIS observations",
      1  "description": "The stack contains 24 ACIS observations",
      1  "description": "The stack contains 25 ACIS observations",
      1  "description": "The stack contains 29 ACIS observations",
    638  "description": "The stack contains 2 ACIS observations",
     29  "description": "The stack contains 2 HRC observations",
      1  "description": "The stack contains 30 ACIS observations",
      1  "description": "The stack contains 32 ACIS observations",
      1  "description": "The stack contains 33 ACIS observations",
      1  "description": "The stack contains 34 ACIS observations",
    176  "description": "The stack contains 3 ACIS observations",
     20  "description": "The stack contains 3 HRC observations",
      1  "description": "The stack contains 40 HRC observations",
      1  "description": "The stack contains 43 ACIS observations",
      1  "description": "The stack contains 44 ACIS observations",
     94  "description": "The stack contains 4 ACIS observations",
      5  "description": "The stack contains 4 HRC observations",
     51  "description": "The stack contains 5 ACIS observations",
     13  "description": "The stack contains 5 HRC observations",
      1  "description": "The stack contains 62 HRC observations",
     25  "description": "The stack contains 6 ACIS observations",
      9  "description": "The stack contains 6 HRC observations",
      1  "description": "The stack contains 71 ACIS observations",
     16  "description": "The stack contains 7 ACIS observations",
      1  "description": "The stack contains 7 HRC observations",
      1  "description": "The stack contains 81 ACIS observations",
      9  "description": "The stack contains 8 ACIS observations",
      2  "description": "The stack contains 8 HRC observations",
      4  "description": "The stack contains 9 ACIS observations",
      1  "description": "The stack contains 9 HRC observations",
   5917  "description": "The stack contains one ACIS observation.",
    217  "description": "The stack contains one HRC observation.",
```

There is code to generate this file in

    /data/dburke2/L3/rel2.0/status

which I should merge into this repository.

## `wwt_status.json`

This looked something like

```
    {'lastupdate': 'string value',
     'srcs_proc': number-of-processed-sources,
     'srcs_pcen': percentage (to 1 dp),
     'stacks': {'acisf...': bool, ...},
	 'completed': {'acisf...': ?, ...}
    }
```

and it's an actual JSON file rather than the above "JS containing JSON
data" files.

The `completed` dictionary only contained completed stacks and the value
was a string representation of the completed time.

## CSC 2.1

Scripts in `code/csc21/`/

These files need to be updated once the final release has been made as
they rely on data provided by Ian on 2022-02-07 during processiung.


| Script                        | Output                   |
| ----------------------------- | ------------------------ |
| `identify_stacks_obis.py`     | `wwt21_obis.js`          |
| `identify_stacks_names.py`    | `wwt21_names.js`         |

These map from the stack name to the list of obis and the target names
of these observations (with duplicates removed from the latter).

The outline version is based on an earlier version I wrote:

    /data/dburke2/L3/rel2.1/outline/create_stack_outline.py

(and has been added to this repository).

Care will be needed to update the outlines with the processed FOV files
rather than the minimally-processed FOV files I used here.

## outlines

In CSC 2.0 I had `wwt20_outlines_base.js` which contained the
FOV outlines as well as data on each stack. However, we can generate
the non-outline data based on the `wwt20_obis.js` and `wwt20_names.js`
field, so it would make sense to just have a mapping for the outlines.

It turns out that we only need the outlines to create the WWT
annotations, so we can save some memory by deleting this outline
data once the annotations are created.

As I don't know how I created the `wwt20_outlines_base.js` file,
I have created a script just to extract the outline data from
it: `hack_outline_base.py`

    % ./code/hack_outline_base.py wwt20_outlines_base.js > wwt20_outlines.json
