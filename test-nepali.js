// Test file to debug NepaliDate constructor
const NepaliDate = require('nepali-date-converter');

console.log('Testing different constructor formats:');

// Test 1: String date (ISO format)
try {
  const result1 = new NepaliDate('2025-11-08');
  console.log('✅ String date:', result1.toString());
  console.log('   BS Year:', result1.getYear());
} catch (e) {
  console.log('❌ String date failed:', e.message);
}

// Test 2: Date object
try {
  const dateObj = new Date('2025-11-08');
  const result2 = new NepaliDate(dateObj);
  console.log('✅ Date object:', result2.toString());
  console.log('   BS Year:', result2.getYear());
} catch (e) {
  console.log('❌ Date object failed:', e.message);
}

// Test 3: Year, month, day numbers
try {
  const result3 = new NepaliDate(2025, 11, 8);
  console.log('✅ YMD numbers:', result3.toString());
  console.log('   BS Year:', result3.getYear());
} catch (e) {
  console.log('❌ YMD numbers failed:', e.message);
}

// Test 4: Static methods if available
try {
  if (NepaliDate.create) {
    const result4 = NepaliDate.create('2025-11-08');
    console.log('✅ Static create:', result4.toString());
    console.log('   BS Year:', result4.getYear());
  } else {
    console.log('❌ No static create method');
  }
} catch (e) {
  console.log('❌ Static create failed:', e.message);
}

// Test 5: Check what the constructor expects
console.log('Constructor:', NepaliDate.toString());
console.log('Available methods:', Object.getOwnPropertyNames(NepaliDate.prototype));
console.log('Available static methods:', Object.getOwnPropertyNames(NepaliDate));