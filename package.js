Package.describe({
  name: 'validated-method',
  summary: 'A simple wrapper for Meteor.methods',
  version: '1.3.1',
  documentation: 'README.md',
});

Package.onUse((api) => {
  api.versionsFrom('1.5');

  api.use(['ecmascript', 'check']);

  api.mainModule('validated-method.js');
});

Package.onTest((api) => {
  api.use([
    'ecmascript',
    'practicalmeteor:mocha@2.1.0_5',
    'practicalmeteor:chai@2.1.0_1',
    'aldeed:simple-schema@1.4.0',
    'validated-method',
    'random',
  ]);

  api.mainModule('validated-method-tests.js');
});
