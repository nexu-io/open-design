import {defineConfig} from '@playwright/test';
import base from './funding.config.ts';
const evidence=process.env.OD_LINK_RUN010_EVIDENCE;if(!evidence)throw new Error('explicit evidence required');
export default defineConfig({...base,testMatch:'link-run010-reconnect-sandbox.test.ts',testIgnore:[],workers:1,retries:0,fullyParallel:false,outputDir:evidence+'/playwright-artifacts',reporter:[['list'],['json',{outputFile:evidence+'/results.json'}],['junit',{outputFile:evidence+'/junit.xml'}]],use:{...base.use,trace:'on',screenshot:'only-on-failure'}});
