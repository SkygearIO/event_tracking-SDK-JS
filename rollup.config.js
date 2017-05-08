import fs from 'fs';
import resolve from 'rollup-plugin-node-resolve';
import commonjs from 'rollup-plugin-commonjs';
import babel from 'rollup-plugin-babel';
import uglify from 'rollup-plugin-uglify';

const format = process.env.format;
const minify = format === 'umd';
const packageJson = JSON.parse(fs.readFileSync('./package.json'));

let external;
let middleName;
if (format === 'cjs') {
  middleName = 'cjs';
  external = Object.keys(packageJson.dependencies || {});
} else if (format === 'umd') {
  middleName = 'min';
  external = undefined;
}

const plugins = [
  resolve({
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
  external,
  moduleName: 'SkygearEventTracking',
  moduleContext: {
    'node_modules/whatwg-fetch/fetch.js': 'window',
  },
  plugins,
};
