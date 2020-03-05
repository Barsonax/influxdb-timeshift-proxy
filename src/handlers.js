const deb_rewrite = require('debug')('rewrite');
const deb_query = require('debug')('query');

const moment = require('moment');
const { resolve } = require('url');

const units = [
    'years', 'months', 'weeks', 'days', 'hours', 'minutes', 'seconds', 'milliseconds', 'quarters',
    'year', 'month', 'week', 'day', 'hour', 'minute', 'second', 'millisecond', 'quarter',
    'y', 'M', 'w', 'd', 'h', 'm', 's', 'ms', 'Q',
];
const shift_re = new RegExp(`[Aa][Ss]\\s+"shift_(.+)_(${units.join('|')})"`);
const diff_re = new RegExp('diff\\(((.+),(.+)\\))')
const from = /(time\s*>=?\s*)([0-9]+)(ms)/;
const to = /(time\s*<=?\s*)([0-9]+)(ms)/;
const from_rel = /(time\s*>=?\s*)(now\(\)\s*-\s*)([0-9]+)([usmhdw])/;
const to_rel = /(time\s*<=?\s*)(now\(\)\s*-\s*)([0-9]+)([usmhdw])/;

function fix_query_time(q, reg, count, unit) {
    const match = q.match(reg);
    if (match) {
        const time = moment(parseInt(match[2], 10));
        time.subtract(count, unit);
        return q.replace(reg, match[1] + time.valueOf() + match[3]);
    }
    return q;
}

function fix_query_time_relative(q, reg, count, unit) {
    const match = q.match(reg);
    if (match) {
        return q.replace(match[0], match[0] + " - " + moment.duration(count, unit).valueOf() + "ms");
    }
    return q;
}

const reLeadingSlash = /^\//;
const reLeadingSemicolon = /^;+/;
const reTwoSemicolon = /;;/;

function forward(path, req, res) {
    if ((req.url.indexOf("/query") === 0) && (req.query.q)) {
        const query = req.query.q.replace(reLeadingSemicolon, '').replace(reTwoSemicolon, '');
        const parts = query.split(';').map((q, idx) => {
            let match;
            deb_query(idx, q);
            match = q.match(shift_re);
            if (match) {
                const diffMatch = match[1].match(diff_re)
                if (diffMatch) {
                    const diffp1 = new Date(diffMatch[2]).valueOf()
                    const diffp2 = new Date(diffMatch[3]).valueOf()
                    match[1] = Math.abs(diffp1 - diffp2).toString()
                }
                if (!req.proxyShift) {
                    req.proxyShift = {};
                }
                req.proxyShift[idx] = {
                    count: parseInt(match[1], 10),
                    unit: match[2]
                };
                deb_rewrite("<-- " + q);
                let select = fix_query_time(q, from, parseInt(match[1], 10), match[2]);
                select = fix_query_time(select, to, parseInt(match[1], 10), match[2]);
                select = fix_query_time_relative(select, from_rel, parseInt(match[1], 10), match[2]);
                select = fix_query_time_relative(select, to_rel, parseInt(match[1], 10), match[2]);
                deb_rewrite("--> " + select);
                return select;
            } else {
                return q;
            }
        });
        const ret = Object.assign({}, req.query, {
            q: parts.join(';')
        });
        const queries = [];
        for (let key in ret) {
            if (ret.hasOwnProperty(key)) {
                queries.push(key + "=" + encodeURIComponent(ret[key]));
            }
        }
        return resolve(path, "query") + "?" + queries.join("&");
    } else {
        return resolve(path, req.url.replace(reLeadingSlash, ''));
    }
}

function intercept(rsp, data, req, res) {
    if (req.proxyShift && Object.keys(req.proxyShift).length) {
        const json = JSON.parse(data.toString());
        if (json.results) {
            const results = json.results.map((result, idx) => {
                if (req.proxyShift[idx] && result.series) {
                    return Object.assign({}, result, {
                        series: result.series.map(serie => {
                            return Object.assign({}, serie, {
                                values: serie.values.map(item => {
                                    const time = moment(item[0]);
                                    time.add(req.proxyShift[idx].count, req.proxyShift[idx].unit);
                                    return [time.valueOf(), item[1]];
                                })
                            });
                        })
                    });
                }
                return result;
            });
            json.results = results;
            return JSON.stringify(json);
        }
    }
    return data;
}

module.exports = {
    forward,
    intercept
};
