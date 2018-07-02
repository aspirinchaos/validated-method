import { check, Match } from 'meteor/check';
import { Meteor } from 'meteor/meteor';

/**
 * Своя функция для уменьшения количества зависимостей
 * @param list {array}
 */
const flatten = list => list.reduce((a, b) => a.concat(Array.isArray(b) ? flatten(b) : b), []);

/**
 * Функция для применения миксинов в методе
 * @param args {object}
 * @param mixins {array}
 * @returns {*}
 */
function applyMixins(args, mixins) {
  // You can pass nested arrays so that people can ship mixin packs
  const flatMixins = flatten(mixins);
  // Save name of the method here, so we can attach it to potential error messages
  const { name } = args;

  flatMixins.forEach((mixin) => {
    args = mixin(args);

    if (!Match.test(args, Object)) {
      const functionName = mixin.toString().match(/function\s(\w+)/);
      let msg = 'One of the mixins';

      if (functionName) {
        msg = `The function '${functionName[1]}'`;
      }

      throw new Error(`Error in ${name} method: ${msg} didn't return the options object.`);
    }
  });

  return args;
}

/**
 * Функция пустышка, вместо постоянной проверки есть функция или нет
 * присвоим в инициализации пустышку, если ничего не передали
 */
const noop = () => {
};

class ValidatedMethod {
  constructor(options) {
    // Default to no mixins
    options.mixins = options.mixins || [];
    options.secure = options.secure || false;
    check(options.mixins, [Function]);
    check(options.name, String);
    options = applyMixins(options, options.mixins);

    // connection argument defaults to Meteor, which is where Methods are defined on client and
    // server
    options.connection = options.connection || Meteor;

    // Allow validate: null shorthand for methods that take no arguments
    options.validate = options.validate || noop;
    if (options.secure && !options.run) {
      options.run = noop;
    }

    // If this is null/undefined, make it an empty object
    options.applyOptions = options.applyOptions || {};

    check(options, Match.ObjectIncluding({
      name: String,
      secure: Boolean,
      validate: Function,
      run: Function,
      mixins: [Function],
      connection: Object,
      applyOptions: Object,
    }));

    // Default options passed to Meteor.apply, can be overridden with applyOptions
    const defaultApplyOptions = {
      // Make it possible to get the ID of an inserted item
      returnStubValue: true,

      // Don't call the server method if the client stub throws an error, so that we don't end
      // up doing validations twice
      throwStubExceptions: true,
    };

    options.applyOptions = Object.assign({}, defaultApplyOptions, options.applyOptions);

    // Attach all options to the ValidatedMethod instance
    Object.assign(this, options);

    const method = this;
    // обертка создания метеоровского метода
    this.connection.methods({
      [options.name](args) {
        // Silence audit-argument-checks since arguments are always checked when using this
        // package
        check(args, Match.Any);
        const methodInvocation = this;

        return method._execute(methodInvocation, args);
      },
    });
  }

  /**
   * Добавление секьюрного вызова
   * @param validate {function} - валидация данных
   * @param run {function} - основная функция метода
   */
  secureRun({ validate, run }) {
    if (Meteor.isClient) {
      throw new Meteor.Error('secure-run-client', 'Защищенный метод добавляется только на сервере!');
    }
    if (validate && typeof validate !== 'function') {
      throw new Meteor.Error('secure-run-validate', 'Validate должна быть функцией!');
    }
    if (typeof run !== 'function') {
      throw new Meteor.Error('secure-run-not-function', 'Run должна быть функцией!');
    }
    if (validate) {
      this.serverValidate = validate;
    }
    this.serverRun = run;
  }


  /**
   * Вызов метода с использованием Promise
   * @param args [{object|string|number}]
   * @returns {Promise<any>}
   */
  callPromise(args) {
    return new Promise((resolve, reject) => {
      this.call(args, (err, result) => {
        if (err) {
          reject(err);
        } else {
          resolve(result);
        }
      });
    });
  }

  /**
   * Вызов метода
   * @param args [{object|string|number}]
   * @param callback [{function}]
   * @returns {*}
   */
  call(args, callback) {
    // Accept calling with just a callback
    if (typeof args === 'function') {
      callback = args;
      args = {};
    }

    try {
      return this.connection.apply(this.name, [args], this.applyOptions, callback);
    } catch (err) {
      if (callback) {
        // Get errors from the stub in the same way as from the server-side method
        callback(err);
      } else {
        // No callback passed, throw instead of silently failing; this is what
        // "normal" Methods do if you don't pass a callback.
        throw err;
      }
    }
  }

  /**
   * Метод вызывается в методе для отработки обертки
   * @param methodInvocation {object} - контекст метеоровского метода
   * @param args [{object|string|number}]
   * @returns {*}
   * @private
   */
  _execute(methodInvocation, args) {
    methodInvocation = methodInvocation || {};

    // Add `this.name` to reference the Method name
    methodInvocation.name = this.name;

    let validateResult = this.validate.bind(methodInvocation)(args);
    // serverValidate и serverRun заданы только на сервере!
    if (this.serverValidate) {
      validateResult = this.serverValidate.bind(methodInvocation)(args);
    }

    if (typeof validateResult !== 'undefined') {
      throw new Meteor.Error('Validate не должна что либо возвращать, используйте throw вместо return');
    }
    // serverValidate и serverRun заданы только на сервере!
    if (this.serverRun) {
      const runResult = this.run.bind(methodInvocation)(args);
      if (typeof runResult !== 'undefined') {
        throw new Meteor.Error('В защищенном методе возвращать что либо должен только secureRun!');
      }
      return this.serverRun.bind(methodInvocation)(args);
    }
    return this.run.bind(methodInvocation)(args);
  }
}

export { ValidatedMethod };
