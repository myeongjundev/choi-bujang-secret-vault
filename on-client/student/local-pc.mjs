// 학생 추가. 로컬 집계만 반환하며 주소·계정·이벤트 본문·명령 오류 원문을 내보내지 않는다.
import os from 'node:os';
import { statfs } from 'node:fs/promises';
import { parse, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { setTimeout as delay } from 'node:timers/promises';

const execFileAsync = promisify(execFile);
const stamp = () => new Date().toISOString();
const number = n => Number.isFinite(n) && n >= 0;
const count = n => Number.isSafeInteger(n) && n >= 0;
const time = s => typeof s === 'string' && Number.isFinite(Date.parse(s));
const codes = new Set(['PC_ACCESS_DENIED', 'PC_QUERY_FAILED', 'PC_TIMEOUT', 'PC_UNSUPPORTED', 'PC_INVALID_DATA']);
const unavailable = (source, code = 'PC_QUERY_FAILED') => ({state:'unavailable', source, checkedAt:stamp(), code:codes.has(code) ? code : 'PC_QUERY_FAILED'});
function errorCode(error) {
  if (error?.killed || error?.name === 'AbortError' || error?.code === 'ETIMEDOUT') return 'PC_TIMEOUT';
  if (['EACCES', 'EPERM'].includes(error?.code)) return 'PC_ACCESS_DENIED';
  return 'PC_QUERY_FAILED';
}

export function cpuPercent(before, after) {
  if (!Array.isArray(before) || !before.length || before.length !== after?.length) throw Error('PC_INVALID_DATA');
  let total = 0, idle = 0;
  for (let i = 0; i < before.length; i++) {
    for (const key of ['user','nice','sys','idle','irq']) {
      const a = before[i]?.times?.[key], b = after[i]?.times?.[key];
      if (!number(a) || !number(b) || b < a) throw Error('PC_INVALID_DATA');
      total += b - a;
      if (key === 'idle') idle += b - a;
    }
  }
  if (!(total > 0) || idle > total) throw Error('PC_INVALID_DATA');
  return Math.round((1 - idle / total) * 1000) / 10;
}

export function networkSummary(interfaces) {
  if (!interfaces || typeof interfaces !== 'object' || Array.isArray(interfaces)) throw Error('PC_INVALID_DATA');
  // 원래 인터페이스 이름, IP, MAC, CIDR는 결과에 포함하지 않는다.
  return Object.values(interfaces).flatMap(rows => {
    if (!Array.isArray(rows)) throw Error('PC_INVALID_DATA');
    const external = rows.filter(row => row?.internal === false);
    if (external.some(row => !['IPv4','IPv6'].includes(row.family))) throw Error('PC_INVALID_DATA');
    if (!external.length) return [];
    return [{ipv4:external.filter(row => row.family === 'IPv4').length, ipv6:external.filter(row => row.family === 'IPv6').length}];
  }).map((row, i) => ({label:'인터페이스 ' + (i + 1), ...row}));
}

export function projectWindows(raw) {
  const out = {};
  for (const [key, inputKey, source] of [
    ['firewall','firewall','Windows Get-NetFirewallProfile ActiveStore'],
    ['systemLog','System','Windows Get-WinEvent System'],
    ['applicationLog','Application','Windows Get-WinEvent Application'],
  ]) {
    const row = raw?.[inputKey];
    out[key] = unavailable(source, row?.code);
    if (row?.state !== 'ok' || !time(row.checkedAt)) continue;
    if (key === 'firewall') {
      if (!Array.isArray(row.profiles) || row.profiles.length !== 3) continue;
      const names = row.profiles.map(p => p?.profile);
      if (new Set(names).size !== 3 || names.some(n => !['Domain','Private','Public'].includes(n))) continue;
      if (row.profiles.some(p => p.enabled !== null && typeof p.enabled !== 'boolean')) continue;
      out[key] = {state:'ok', source, checkedAt:row.checkedAt, profiles:row.profiles.map(p => ({profile:p.profile,enabled:p.enabled}))};
    } else {
      if (!count(row.errors) || !count(row.warnings) || row.errors + row.warnings > 5000 ||
          row.limit !== 5000 || typeof row.truncated !== 'boolean' || !time(row.windowStart) ||
          Date.parse(row.windowStart) > Date.parse(row.checkedAt)) continue;
      out[key] = {state:'ok', source, checkedAt:row.checkedAt, windowStart:row.windowStart,
        errors:row.errors, warnings:row.warnings, truncated:row.truncated, limit:5000};
    }
  }
  return out;
}

export async function readWindows({signal} = {}) {
  if (process.platform !== 'win32') throw Object.assign(Error('PC_UNSUPPORTED'),{code:'PC_UNSUPPORTED'});
  const executable = join(process.env.SystemRoot || 'C:\\Windows','System32','WindowsPowerShell','v1.0','powershell.exe');
  const script = fileURLToPath(new URL('./read-local-windows.ps1',import.meta.url));
  const {stdout} = await execFileAsync(executable,['-NoLogo','-NoProfile','-NonInteractive','-File',script],
    {windowsHide:true, timeout:14000, maxBuffer:65536, encoding:'utf8', signal});
  return JSON.parse(stdout.replace(/^\uFEFF/, ''));
}

export async function collectLocalPc({
  projectDirectory = fileURLToPath(new URL('../',import.meta.url)), signal,
  osApi = os, diskReader = statfs, windowsReader = readWindows, cpuIntervalMs = 800,
} = {}) {
  const startedAt = stamp();
  const resources = {};
  async function read(key, source, work) {
    try { resources[key] = {state:'ok',source,...await work(),checkedAt:stamp()}; }
    catch (error) { resources[key] = unavailable(source,error?.message === 'PC_INVALID_DATA' ? 'PC_INVALID_DATA' : errorCode(error)); }
  }
  await Promise.all([
    read('cpu','Node os.cpus interval', async () => {
      const before = osApi.cpus(), began = performance.now();
      await delay(cpuIntervalMs,undefined,{signal});
      return {percent:cpuPercent(before,osApi.cpus()),intervalMs:Math.round(performance.now() - began)};
    }),
    read('memory','Node os.totalmem/freemem',async () => {
      const totalBytes = osApi.totalmem(), freeBytes = osApi.freemem();
      if (!number(totalBytes) || !number(freeBytes) || totalBytes <= 0 || freeBytes > totalBytes) throw Error('PC_INVALID_DATA');
      return {totalBytes,usedBytes:totalBytes-freeBytes,percent:Math.round((1-freeBytes/totalBytes)*1000)/10};
    }),
    read('disk','Node fs.statfs project volume', async () => {
      const s = await diskReader(parse(resolve(projectDirectory)).root);
      const totalBytes = Number(s.blocks) * Number(s.bsize), availableBytes = Number(s.bavail) * Number(s.bsize);
      if (!number(totalBytes) || !number(availableBytes) || totalBytes <= 0 || availableBytes > totalBytes) throw Error('PC_INVALID_DATA');
      return {totalBytes,availableBytes,scope:'project-volume'};
    }),
    read('network','Node os.networkInterfaces address configuration',async () => ({interfaces:networkSummary(osApi.networkInterfaces())})),
    (async () => {
      try { Object.assign(resources,projectWindows(await windowsReader({signal}))); }
      catch (error) {
        for (const [key,source] of [['firewall','Windows Get-NetFirewallProfile ActiveStore'],['systemLog','Windows Get-WinEvent System'],['applicationLog','Windows Get-WinEvent Application']]) {
          resources[key] = unavailable(source,error?.code === 'PC_UNSUPPORTED' ? 'PC_UNSUPPORTED' : errorCode(error));
        }
      }
    })(),
  ]);
  return {schema:'keshev.student.local-pc.v1',evidence:'measured-local',startedAt,checkedAt:stamp(),resources};
}
