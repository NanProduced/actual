import * as monthUtils from '#shared/months';
import {
  format as formatDate,
  parse as parseDate,
  isValid as isValidDate,
  addDays,
  subDays,
} from 'date-fns';
import { zhCN } from 'date-fns/locale';

import type { IntegerAmount } from '#shared/util';

const CHINESE_NUMBERS: Record<string, number> = {
  零: 0,
  一: 1,
  二: 2,
  两: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  七: 7,
  八: 8,
  九: 9,
  十: 10,
};

const CHINESE_WEEKDAYS: Record<string, number> = {
  日: 0,
  天: 0,
  一: 1,
  二: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
};

function parseChineseNumber(text: string): number | null {
  let result = 0;
  let temp = 0;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const num = CHINESE_NUMBERS[char];

    if (num !== undefined) {
      if (char === '十') {
        temp = temp === 0 ? 10 : temp * 10;
      } else {
        temp = temp + num;
      }
    } else {
      return null;
    }
  }

  return temp > 0 ? temp : null;
}

export function parseRelativeDate(input: string, now: Date = new Date()): Date | null {
  const lowerInput = input.toLowerCase();

  if (lowerInput.includes('今天') || lowerInput.includes('today')) {
    return new Date(now);
  }

  if (lowerInput.includes('昨天') || lowerInput.includes('yesterday')) {
    return subDays(new Date(now), 1);
  }

  if (lowerInput.includes('前天') || lowerInput.includes('day before yesterday')) {
    return subDays(new Date(now), 2);
  }

  const daysAgoMatch = lowerInput.match(/(\d+|[\u4e00-\u9fa5]+)\s*天前/);
  if (daysAgoMatch) {
    let days: number | null = parseInt(daysAgoMatch[1], 10);
    if (isNaN(days)) {
      days = parseChineseNumber(daysAgoMatch[1]);
    }
    if (days !== null && days > 0) {
      return subDays(new Date(now), days);
    }
  }

  const daysLaterMatch = lowerInput.match(/(\d+|[\u4e00-\u9fa5]+)\s*天后/);
  if (daysLaterMatch) {
    let days: number | null = parseInt(daysLaterMatch[1], 10);
    if (isNaN(days)) {
      days = parseChineseNumber(daysLaterMatch[1]);
    }
    if (days !== null && days > 0) {
      return addDays(new Date(now), days);
    }
  }

  const lastWeekMatch = lowerInput.match(/上周([日天一二三四五六])/);
  if (lastWeekMatch) {
    const targetDay = CHINESE_WEEKDAYS[lastWeekMatch[1]];
    if (targetDay !== undefined) {
      const currentDay = now.getDay();
      let daysAgo = currentDay + (7 - targetDay);
      if (daysAgo > 7) {
        daysAgo -= 7;
      }
      return subDays(new Date(now), daysAgo);
    }
  }

  const nextWeekMatch = lowerInput.match(/下周([日天一二三四五六])/);
  if (nextWeekMatch) {
    const targetDay = CHINESE_WEEKDAYS[nextWeekMatch[1]];
    if (targetDay !== undefined) {
      const currentDay = now.getDay();
      let daysLater = targetDay - currentDay;
      if (daysLater <= 0) {
        daysLater += 7;
      }
      return addDays(new Date(now), daysLater);
    }
  }

  return null;
}

export function parseDateInput(input: string, dateFormat: string): string | null {
  const now = new Date();

  const relativeDate = parseRelativeDate(input, now);
  if (relativeDate) {
    return monthUtils.dayFromDate(relativeDate);
  }

  const dayMonthRegex = monthUtils.getDayMonthRegex(dateFormat);
  if (dayMonthRegex.test(input)) {
    const test = parseDate(
      input,
      monthUtils.getDayMonthFormat(dateFormat),
      now,
    );
    if (isValidDate(test)) {
      return monthUtils.dayFromDate(test);
    }
  }

  const test = parseDate(input, dateFormat, now);
  if (test.getFullYear() > 2000 && isValidDate(test)) {
    return monthUtils.dayFromDate(test);
  }

  const isoMatch = input.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (isoMatch) {
    const year = parseInt(isoMatch[1], 10);
    const month = parseInt(isoMatch[2], 10) - 1;
    const day = parseInt(isoMatch[3], 10);
    const date = new Date(year, month, day);
    if (isValidDate(date) && year >= 2000) {
      return monthUtils.dayFromDate(date);
    }
  }

  return null;
}

export function formatDateForDisplay(dateStr: string, dateFormat: string): string {
  const date = monthUtils.parseDate(dateStr);
  return formatDate(date, dateFormat, { locale: zhCN });
}

export function parseAmount(input: string): {
  amount: IntegerAmount | null;
  raw: string | null;
} {
  const patterns = [
    /(\d+(?:\.\d{1,2})?)\s*元/,
    /(\d+(?:\.\d{1,2})?)\s*块/,
    /(\d+(?:\.\d{1,2})?)\s*yuan/i,
    /(\d+(?:\.\d{1,2})?)\s*rmb/i,
    /[￥¥]\s*(\d+(?:\.\d{1,2})?)/,
    /[$]\s*(\d+(?:\.\d{1,2})?)/,
    /\b(\d+(?:\.\d{1,2})?)\b/,
  ];

  for (const pattern of patterns) {
    const match = input.match(pattern);
    if (match) {
      const raw = match[0];
      const value = parseFloat(match[1]);
      if (!isNaN(value) && value >= 0) {
        const amount = Math.round(value * 100) as IntegerAmount;
        return { amount, raw };
      }
    }
  }

  return { amount: null, raw: null };
}
