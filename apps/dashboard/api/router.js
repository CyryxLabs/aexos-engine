'use strict';
const { createHandler } = require('../lib/backend');
let handler;
module.exports = (request, response) => {
  if (!handler) handler = createHandler();
  return handler(request, response);
};
