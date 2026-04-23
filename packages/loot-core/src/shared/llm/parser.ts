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

export function extractPayeeName(input: string, amount: string | null): string | null {
  let text = input;

  if (amount) {
    text = text.replace(amount, '');
  }

  text = text.replace(/[￥¥$]\s*\d+(?:\.\d{1,2})?/g, '');
  text = text.replace(/\d+(?:\.\d{1,2})?\s*(元|块|yuan|rmb)/gi, '');
  text = text.replace(/(昨天|前天|今天|明天|后天|\d+\s*天前|\d+\s*天后|上周[日天一二三四五六]|下周[日天一二三四五六])/g, '');
  text = text.replace(/(刷卡|信用卡|支付宝|微信|微信支付|现金|银行卡|借记卡|储蓄卡)/g, '');
  text = text.replace(/(收入|支出|花费|买了|买|去了|在|到|从)/g, '');
  text = text.replace(/\s+/g, ' ').trim();

  if (text.length > 0 && text.length < 20) {
    return text;
  }

  return null;
}

export function inferAccountFromPaymentMethod(input: string): string | null {
  const lower = input.toLowerCase();

  if (lower.includes('信用卡') || lower.includes('刷卡') || lower.includes('credit card')) {
    return '信用卡';
  }

  if (lower.includes('支付宝') || lower.includes('alipay')) {
    return '支付宝';
  }

  if (lower.includes('微信') && lower.includes('支付')) {
    return '微信支付';
  }

  if (lower.includes('微信')) {
    return '微信';
  }

  if (lower.includes('现金') || lower.includes('cash')) {
    return '现金';
  }

  if (lower.includes('储蓄卡') || lower.includes('借记卡') || lower.includes('银行卡')) {
    return '储蓄卡';
  }

  return null;
}

export function inferCategoryFromKeywords(input: string): string | null {
  const lower = input.toLowerCase();

  const categoryMap: Array<{ keywords: string[]; category: string }> = [
    { keywords: ['咖啡', '奶茶', '星巴克', '瑞幸', '咖啡店'], category: '餐饮' },
    { keywords: ['吃饭', '餐厅', '饭店', '外卖', '美团', '饿了么', '午餐', '晚餐', '早餐', '夜宵'], category: '餐饮' },
    { keywords: ['打车', '滴滴', '出租车', '快车', '专车'], category: '交通' },
    { keywords: ['地铁', '公交', '共享单车', '地铁票', '公交车'], category: '交通' },
    { keywords: ['加油', '停车费', '洗车', '保养', '修车'], category: '汽车' },
    { keywords: ['工资', '奖金', '补贴', '报销', '退款'], category: '收入' },
    { keywords: ['房租', '水电', '物业费', '网费', '房贷'], category: '住房' },
    { keywords: ['衣服', '鞋子', '包包', '化妆品', '护肤品', '淘宝', '京东', '拼多多', '购物'], category: '购物' },
    { keywords: ['电影', 'KTV', '游戏', '旅游', '度假', '娱乐'], category: '娱乐' },
    { keywords: ['医院', '看病', '买药', '体检', '保险'], category: '医疗' },
    { keywords: ['话费', '流量', '充值'], category: '通讯' },
    { keywords: ['学习', '课程', '书', '教育', '培训'], category: '教育' },
  ];

  for (const { keywords, category } of categoryMap) {
    for (const keyword of keywords) {
      if (lower.includes(keyword)) {
        return category;
      }
    }
  }

  return null;
}

export function isIncomeInput(input: string): boolean {
  const lower = input.toLowerCase();
  return (
    lower.includes('工资') ||
    lower.includes('奖金') ||
    lower.includes('补贴') ||
    lower.includes('报销') ||
    lower.includes('退款') ||
    lower.includes('收入') ||
    lower.includes('理财收益') ||
    lower.includes('利息')
  );
}
