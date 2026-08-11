#!/usr/bin/env node

import { run } from '../lib/client/index.js';

process.exitCode = await run(process.argv);
