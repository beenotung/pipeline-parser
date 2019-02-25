import * as util from 'util';
import {format} from 'util';

export let logFunctionCall = true;
export let logFunctionResult = true;

export type parser<A = any, B = any> = (xs: A[]) => B[];
export let parser = xs => xs;

export function defn<F extends (...args) => A, A>(name: string, f: F, skipLog = false): F {
  return {
    [name]: function () {
      if (!skipLog && logFunctionCall) {
        util.log(
          format('calling', name + '(', ...arguments, ')')
            .replace('( ', '(')
            .replace(/ \)$/, ')')
        );
      }
      const result = f.apply(null, arguments);
      if (!skipLog && logFunctionResult) {
        util.log(
          format(name + '(', ...arguments, ') =', result)
            .replace('( ', '(')
            .replace(' ) =', ') =')
        );
      }
      return result;
    } as any,
  }[name];
}

export function stackBefore(f: parser) {
  const g = parser;
  parser = xs => g(f(xs));
}

export function stackAfter(f: parser) {
  const g = parser;
  parser = xs => f(g(xs));
}

const any = Symbol.for('any');
const truethy = () => true;

const parseNFilter = defn('parseNFilter', (filters: Array<(a) => boolean>, mapper: (args: any[]) => any[]) => (xs: any[]) => {
  if (xs.length === 0) {
    return xs;
  }
  const ys = [];
  xs.forEach(x => {
    ys.push(x);
    if (ys.length >= filters.length) {
      if (filters.every((filter, i) => filter(ys[i + (ys.length - filters.length)]))) {
        const args = ys.splice(ys.length - filters.length, filters.length);
        ys.push(...mapper(args));
      }
    }
  });
  return ys;
}, true);

const parseNToken = defn('parseNToken', (tokens: any[], mapper: (...xs) => any[]) =>
  parseNFilter(tokens.map(token => x => token === any || token === x), mapper), true);

export let isNumDigit = defn('isNumDigit', c => +c === +c, true);

stackAfter(defn('parseNumberToken', xs => {
  const ys = [];
  xs.forEach(x => {
    ys.push(x);
    if (ys.length >= 2) {
      const r = ys.pop();
      const l = ys.pop();
      if (isNumDigit(l) && isNumDigit(r)) {
        ys.push(l + r);
      } else {
        ys.push(l, r);
      }
    }
  });
  return ys;
}, true));
stackAfter(defn('parseNumberString', xs => xs.map(x => +x === +x ? +x : x), true));

export let parseBracket = defn('parseBracket', xs => {
  const ys = [];
  xs.forEach(x => {
    ys.push(x);
    if (x === ')') {
      ys.pop();
      const stack = [];
      for (; ;) {
        const x = ys.pop();
        if (x === '(') {
          stack.reverse();
          const result = parser(stack);
          ys.push(...result);
          break;
        } else {
          stack.push(x);
        }
      }
    }
  });
  return ys;
}, true);
stackAfter(parseBracket);

stackAfter(defn('parseNegativeNumber', xs => {
  const ys = [];
  for (let i = 0; i < xs.length; i++) {
    if (typeof xs[i - 1] !== 'number' && xs[i] === '-' && typeof xs[i + 1] === 'number') {
      i++;
      ys.push(-xs[i]);
    } else {
      ys.push(xs[i]);
    }
  }
  return ys;
}, true));

stackAfter(defn('parse*/',
  parseNFilter([truethy, x => x === '*' || x === '/', truethy], ([l, op, r]) => [op === '*' ? l * r : l / r]), true));
stackAfter(defn('parse+-',
  parseNFilter([truethy, x => x === '+' || x === '-', truethy], ([l, op, r]) => [op === '+' ? l + r : l - r]), true));

export let parseString = defn('parseString', (s: string) => parser(s.split('')), true);

function test(s: string) {
  const answer = eval(s);
  const result = parseString(s);
  console.log('s:', s);
  console.log('answer:', answer);
  console.log('result:', result);
  console.log('correct:', answer === result[0]);
}

// FIXME may have name conflict using this cheap macro approach
if ('support set(name,value)') {
  const vars = {};
  stackBefore(defn('parseUseVariable', xs => xs.map(x => x in vars ? vars[x] : x), true));
  stackBefore(defn('parseSetVariable',
    parseNToken(['set', '(', any, ',', any, ')'], ([_set, _open, name, _comma, value, _close]) => {
      return [vars[name] = value];
    }),
    true));
  stackBefore(defn('parseSetWord', parseNToken('set'.split(''), () => ['set']), true));
  global['set' as any] = function set(name, value) {
    global[name] = value;
    return value;
  };
  global['x' as any] = 'x';
  test('set(x,3)');
  test('(x+(2*x)/(1-x))');
  process.exit();
}

test('(3+(2*3)/(1-3))');
test('-12-34+56*78/90');
test('12-34+56*78/90');
test('12-34+56');
test('56*78/90');
