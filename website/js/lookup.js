'use strict';

/* global XMLHttpRequest */

// Query the LookUP service for converting Astronomical names to
// RA/Dec values: https://www.strudel.org.uk/lookUP/
//
// The following code is based on
// https://raw.githubusercontent.com/slowe/astro.js/master/astro.lookup.js
//
const lookup = (() => {

  function cleanQueryValue(val) {
    return encodeURIComponent(val)
      .replace(/!/g, '%21')
      .replace(/'/g, '%27')
      .replace(/\(/g, '%28')
      .replace(/\)/g, '%29')
      .replace(/\*/g, '%2A')
      .replace(/%0A/g, '\n');
  }

  // Look up the name and if there is a success call
  //      callback(ra, dec, service, category)
  // and error handler (string argument, representing HTML for the
  // message).
  //
  // The service argument is the name of the service which returned
  // the location, and may not be set. The category argument is the
  // category information from lookUP and may be null.
  //
  function lookupName(objectName, callback, errhandle) {

    const lup = new XMLHttpRequest();
    if (!lup) {
      errhandle('INTERNAL ERROR: unable to create request');
      return;
    }

    var src = 'https://www.strudel.org.uk/lookUP/json/?name=' +
      cleanQueryValue(objectName);

    // Why am I not using d here?
    lup.onreadystatechange = (d) => {
      if (lup.readyState === XMLHttpRequest.DONE) {
        if (lup.status === 200) {
          const response = JSON.parse(lup.responseText);
          process(objectName, callback, errhandle, response);
        } else {
	  errhandle('There was a problem calling the lookUP service.');
        }
      }
    };

    lup.open('GET', src);
    lup.send();
  }

  function process(objectname, callback, errhandle, d) {

    if (typeof d === 'undefined' || (d.type && d.type === 'error')) {
      errhandle('There was a problem querying the lookUP service.');
      return;
    }

    if (d.target && d.target.suggestion) {
      let msg = '<p>Target "' + objectname + '" not found.</p>' +
	'<p>Did you mean "' + d.target.suggestion + '"?</p>';
      errhandle(msg);
      return;
    }

    if (d.ra) {
      let service = null;
      if (d.service) {
	service = d.service.name;
      }

      let category = null;
      if (d.category) {
	category = d.category;
      }

      callback(d.ra.decimal, d.dec.decimal, service, category);
      return;
    }

    let msg;
    if (d.message) {
      /* Could add objectname here, but not sure what
         LookUp is returning */
      msg = d.message;
    } else {
      msg = 'Target "' + objectname + '" not found.';
    }
    errhandle(msg);
  }

  return { lookupName: lookupName };

})();
