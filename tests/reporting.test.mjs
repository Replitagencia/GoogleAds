import {test} from 'node:test';
import assert from 'node:assert/strict';
import {periods,change,sum,measurementMessage} from '../lib/reporting.ts';
test('two equally sized complete periods across a year boundary',()=>{const p=periods(7,'America/Santiago',new Date('2027-01-04T12:00:00Z'));assert.equal(p.start,'2026-12-28');assert.equal(p.end,'2027-01-03');assert.equal(p.previousStart,'2026-12-21');assert.equal(p.previousEnd,'2026-12-27');assert.equal(p.elapsedDays,3);});
test('account timezone governs month boundary and excludes the partial day',()=>{const p=periods(30,'America/Santiago',new Date('2026-11-01T01:00:00Z'));assert.equal(p.today,'2026-10-31');assert.equal(p.month,'2026-10');assert.equal(p.end,'2026-10-30');});
test('month projection handles first day and leap year',()=>{const p=periods(7,'UTC',new Date('2028-02-01T00:00:00Z'));assert.equal(p.elapsedDays,0);assert.equal(p.monthDays,29);});
test('comparisons do not manufacture percentages when baseline is zero',()=>{assert.equal(change(12,0),null);assert.equal(change(0,10),-100);assert.equal(change(150,100),50);});
test('fractional attributed conversions are retained',()=>{assert.deepEqual(sum([{cost:12.25,clicks:1,impressions:5,conversions:.5},{cost:4.5,clicks:2,impressions:8,conversions:.25}]),{cost:16.75,clicks:3,impressions:13,conversions:.75});});
test('unavailable measurement is distinct from configured actions with zero results',()=>{const action={id:'1',name:'Formulario',category:'LEAD',status:'ENABLED',primary:true,conversions:0,allConversions:0};assert.match(measurementMessage([],['conversions']),/No se pudo consultar/);assert.match(measurementMessage([action],[]),/Esto no confirma/);assert.match(measurementMessage([action],['conversionMetrics']),/No se muestran como cero/);});
