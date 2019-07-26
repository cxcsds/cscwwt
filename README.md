
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

Note that this is a slow process, as it queries the CSCCLI for each stack
independently. It should probably chunk things up. The current run time is
of order an hour.

The screen output of parse_stack_names provides information on how the 
version numbers are distributed. This is partly relevant because missing
files - that is, those that the CSCCLI doesn't report information in because
there are no sources in the stack and this means the CSCCLI doesn't "find"
them - are given a default version (matching either the smallest version or
the version with the most matches).

The version.OPTION.json is then copied to /data/da/Docs/cscweb/csc2/wwtdata/
and published to the test and/or live site.


Have updated the code so that get_stack_names now chunks requests (makes
less calls to the CSCCLI) so does that speed things up? Well, one run went
from just less than an hour to 6 minutes.



