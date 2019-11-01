
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

Created: version.stkbkgimg
Created: version.stkexpmap
Created: version.sensity
Created: version.stkevt3
Created: version.stkecorrimg
1.578u 0.539s 2:03:55.67 0.0%	0+0k 0+14904io 0pf+0w

Saved the output of "no ... data for stacks" to missing.lis - looks like
only one stack per line

% grep stkevt3 missing.lis | wc -l
25
% grep stkecorr missing.lis | wc -l
25

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

foreach option ( stkevt3 stkecorrimg stkbkgimg stkexpmap sensity )
  set out = version.${option}.json
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


### To update a single "data type" (aka OPTION)

% python code/get_stack_names.py code/stacks.pd2.txt OPTION > version.OPTION
% python code/parse_stack_names.py OPTION version.OPTION > version.OPTION.json
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

The version.OPTION.json is then copied to /data/da/Docs/cscweb/csc2/wwtdata/
and published to the test and/or live site.
