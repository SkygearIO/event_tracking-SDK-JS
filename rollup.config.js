import resolve from 'rollup-plugin-node-resolve';
import commonjs from 'rollup-plugin-commonjs';
import babel from 'rollup-plugin-babel';
import uglify from 'rollup-plugin-uglify';

const format = process.env.format;
const minify = format === 'umd';

let middleName;
if (format === 'cjs') {
  middleName = 'cjs';
} else if (format === 'umd') {
  middleName = 'min';
}

const plugins = [
  resolve({
    preferBuiltins: false, // we use querystring and url from npm
  }),
  commonjs({
    include: 'node_modules/**',
  }),
  babel({
    exclude: 'node_modules/**',
  }),
];
if (minify) {
  plugins.push(uglify());
}

export default {
  entry: 'src/index.js',
  dest: `dist/bundle.${middleName}.js`,
  format,
  moduleName: 'SkygearEventTracking',
  moduleContext: {
    'node_modules/whatwg-fetch/fetch.js': 'window',
  },
  plugins,
};
