import { en } from './en';
import type { Dict } from '../types';

export const th: Dict = {
  ...en,
  'settings.agentInstall.install': 'ติดตั้ง',
  'settings.agentInstall.docs': 'เอกสาร',
  'settings.agentInstall.pathHint':
    'หากคุณติดตั้ง CLI ด้วย npm หรือ Homebrew แล้วแต่ยังแสดงว่าไม่ได้ติดตั้ง โปรดตรวจสอบว่าโฟลเดอร์ bin ของเครื่องมือนั้นอยู่ใน PATH ที่ Open Design daemon ใช้งาน (บน macOS ค่า PATH ของ Terminal และแอป GUI อาจต่างกัน) ดู QUICKSTART.md (ส่วน "Local agent CLI and PATH")',
  'settings.agentInstall.stepOpenLinks': 'เปิดลิงก์ติดตั้งหรือเอกสารสำหรับเอเจนต์ที่ต้องการ',
  'settings.agentInstall.stepAuth':
    'ยืนยันตัวตนกับ CLI ของผู้ให้บริการ (ลงชื่อเข้าใช้หรือเพิ่มข้อมูลรับรอง API) ก่อนกลับไปที่ Open Design',
  'settings.agentInstall.stepRescan': 'คลิกสแกนใหม่ในส่วนนี้',
  'settings.agentInstall.stepSelect': 'เลือกการ์ดเอเจนต์เมื่อแสดงว่าได้ติดตั้งแล้ว',
};
