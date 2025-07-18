import svelte from 'rollup-plugin-svelte';
import commonjs from '@rollup/plugin-commonjs';
import resolve from '@rollup/plugin-node-resolve';
import livereload from 'rollup-plugin-livereload';
import {terser} from 'rollup-plugin-terser';
import css from 'rollup-plugin-css-only';
import replace from "@rollup/plugin-replace";
import {babel} from '@rollup/plugin-babel';
import json from '@rollup/plugin-json';
import dotenv from 'dotenv';

// Load .env fiel
dotenv.config();

const production = !process.env.ROLLUP_WATCH;

function serve() {
    let server;

    function toExit() {
        if (server) server.kill(0);
    }

    return {
        writeBundle() {
            if (server) return;
            server = require('child_process').spawn('npm', ['run', 'start', '--', '--dev'], {
                stdio: ['ignore', 'inherit', 'inherit'],
                shell: true
            });

            process.on('SIGTERM', toExit);
            process.on('exit', toExit);
        }
    };
}

export default {
    input: 'src/main.js',
    treeshake: !production,
    output: {
        sourcemap: !production,
        format: 'iife',
        name: 'app',
        file: 'public/build/bundle.js'
    },
    plugins: [
        svelte({
            compilerOptions: {
                // enable run-time checks when not in production
                dev: !production
            }
        }),
        // we'll extract any component CSS out into
        // a separate file - better for performance
        css({output: 'bundle.css'}),

        // If you have external dependencies installed from
        // npm, you'll most likely need these plugins. In
        // some cases you'll need additional configuration -
        // consult the documentation for details:
        // https://github.com/rollup/plugins/tree/master/packages/commonjs
        resolve({
            preferBuiltins: true,
            browser: true,
            dedupe: ['svelte']
        }),
        commonjs({ sourceMap: false }),
        json(),
        production && babel({
            babelHelpers: 'bundled',
            extensions: ['.js', '.mjs', '.html', '.svelte'],
            include: ['src/**', 'node_modules/svelte/**'],
        }),

        replace({
            env: JSON.stringify({
                CLIENT_ID: process.env.CLIENT_ID,
                REDIRECT_URI: process.env.REDIRECT_URI,
                FRONTPAGE_URL: process.env.FRONTPAGE_URL,
                DOCS_URL: process.env.DOCS_URL,
                API_URL: process.env.API_URL,
                WS_URL: process.env.WS_URL,
                INVITE_URL: process.env.INVITE_URL,
                TITLE: process.env.TITLE,
                DESCRIPTION: process.env.DESCRIPTION,
                FAVICON: process.env.FAVICON,
                FAVICON_TYPE: process.env.FAVICON_TYPE,
                WHITELABEL_DISABLED: process.env.WHITELABEL_DISABLED,
            })
        }),

        // In dev mode, call `npm run start` once
        // the bundle has been generated
        !production && serve(),

        // Watch the `public` directory and refresh the
        // browser on changes when not in production
        !production && livereload('public'),

        // If we're building for production (npm run build
        // instead of npm run dev), minify
        production && terser()
    ],
    watch: {
        clearScreen: false
    }
};
