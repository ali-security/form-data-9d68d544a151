'use strict';

var Buffer = require('safe-buffer').Buffer; // eslint-disable-line no-shadow

var common = require('../common');
var assert = common.assert;

var FormData = require(common.dir.lib + '/form_data');

/**
 * Helper to get form body as a string by concatenating all string/buffer streams.
 * @param {Object} form - FormData instance
 * @returns {Buffer} serialized form body
 */
function getFormBuffer(form) {
  var bufs = [];
  for (var i = 0; i < form._streams.length; i++) {
    var stream = form._streams[i];
    if (typeof stream === 'string') {
      bufs.push(Buffer.from(stream));
    } else if (Buffer.isBuffer(stream)) {
      bufs.push(stream);
    }
  }
  bufs.push(Buffer.from(form._lastBoundary()));
  return Buffer.concat(bufs);
}

(function testFieldNameCRLFInjection() {
  var form = new FormData();
  form.append('email"\r\nX-Injected: true\r\nfake="', 'user@example.com');

  var output = getFormBuffer(form).toString();

  assert.equal(output.indexOf('X-Injected: true\r\n'), -1, 'CRLF in a field name must not produce an injected header line');
  assert.notEqual(output.indexOf('%0D%0A'), -1, 'CR/LF in a field name must be escaped');
  assert.notEqual(output.indexOf('%22'), -1, 'a `"` in a field name must be escaped');
}());

(function testFilenameCRLFInjection() {
  var form = new FormData();
  form.append('file', Buffer.from('x'), {filename: 'a"\r\nX-Injected: yes\r\nb"'});

  var output = getFormBuffer(form).toString();

  assert.equal(output.indexOf('X-Injected: yes\r\n'), -1, 'CRLF in a filename must not produce an injected header line');
  assert.notEqual(output.indexOf('filename="a%22%0D%0A'), -1, 'CR/LF/`"` in a filename must be escaped');
}());

(function testFilepathCRLFInjection() {
  var form = new FormData();
  form.append('file', Buffer.from('x'), {filepath: 'dir/a"\r\nX-Injected: nope\r\nb"'});

  var output = getFormBuffer(form).toString();

  assert.equal(output.indexOf('X-Injected: nope\r\n'), -1, 'CRLF in a filepath must not produce an injected header line');
  assert.notEqual(output.indexOf('filename="dir/a%22%0D%0A'), -1, 'CR/LF/`"` in a filepath must be escaped');
}());

(function testValueNameCRLFInjection() {
  // formidable- and browser-supplied values carry their own `name` property
  var form = new FormData();
  var header = form._multiPartHeader('file', {name: 'a"\r\nX-Injected: never\r\nb"', readable: true}, {});

  assert.equal(header.indexOf('X-Injected: never\r\n'), -1, 'CRLF in a value name must not produce an injected header line');
  assert.notEqual(header.indexOf('filename="a%22%0D%0A'), -1, 'CR/LF/`"` in a value name must be escaped');
}());

(function testFieldNameBoundarySmuggling() {
  var form = new FormData();
  var boundary = form.getBoundary();

  form.append('username"\r\n\r\nlegit_user\r\n--' + boundary + '\r\nContent-Disposition: form-data; name="is_admin"\r\n\r\ntrue\r\n--' + boundary + '\r\nContent-Disposition: form-data; name="fake', 'ignored_value');

  var output = getFormBuffer(form).toString();
  var headerLines = output.split('\r\n').filter(function (line) {
    return line.indexOf('Content-Disposition') === 0;
  });

  assert.equal(output.indexOf('name="is_admin"'), -1, 'a CRLF-laden field name must not smuggle an extra part');
  assert.equal(headerLines.length, 1, 'the whole field name must stay on one header line, smuggling no extra parts');
}());

(function testOrdinaryFieldNamePreserved() {
  var form = new FormData();
  form.append('items[0]', 'value');

  var output = getFormBuffer(form).toString();

  assert.notEqual(output.indexOf('name="items[0]"'), -1, 'a field name without control characters must be unchanged');
}());

(function testOrdinaryFilenamePreserved() {
  var form = new FormData();
  form.append('file', Buffer.from('x'), {filename: 'report-2024.png'});

  var output = getFormBuffer(form).toString();

  assert.notEqual(output.indexOf('filename="report-2024.png"'), -1, 'a filename without control characters must be unchanged');
}());
