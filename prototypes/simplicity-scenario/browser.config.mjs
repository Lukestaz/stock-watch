import {defineConfig,devices} from '../../tests/dashboard/node_modules/@playwright/test/index.mjs';
import {fileURLToPath} from 'node:url';
export default defineConfig({testDir:fileURLToPath(new URL('.',import.meta.url)),testMatch:'browser.spec.mjs',workers:1,retries:0,forbidOnly:!!process.env.CI,timeout:30000,
 outputDir:fileURLToPath(new URL('../../scenario-test-results',import.meta.url)),
 reporter:[['list'],['json',{outputFile:fileURLToPath(new URL('../../scenario-browser-results.json',import.meta.url))}]],
 use:{baseURL:'http://127.0.0.1:4174',serviceWorkers:'block',trace:'retain-on-failure'},
 projects:[{name:'chromium-desktop',use:{...devices['Desktop Chrome']}},{name:'webkit-mobile',use:{...devices['iPhone 13']}}],
 webServer:{command:'node prototypes/simplicity-scenario/serve.mjs',cwd:fileURLToPath(new URL('../../',import.meta.url)),url:'http://127.0.0.1:4174',reuseExistingServer:false,timeout:15000}});
