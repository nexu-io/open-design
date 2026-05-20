# Studio365 Local Bootstrap Prompt Pack (ภาษาไทย)

ชุด prompt นี้ออกแบบสำหรับใช้งานกับ Antigravity ทีละเฟสตามลำดับ ถ่ายโอนผลลัพธ์กลับสู่ CSV ทุกครั้ง
และห้ามข้ามเฟส Audit/Plan เพื่อไปติดตั้งทันที

## วิธีใช้สั้น ๆ
- รันทีละ Prompt ตามลำดับ: P0 → P1 → P2 → P3 → P4 → P5 → P6 → P7 → P8
- ทุกครั้งให้ Antigravity อัปเดตไฟล์ CSV เสมอ
- ห้ามเริ่มติดตั้งอะไรก่อนเสร็จ P3 และได้รับการอนุมัติ

## P0 — Master Controller

คุณคือตัวควบคุม Local Operations Controller ของโปรเจกต์ Studio365 บนเครื่อง Local

เป้าหมาย:
- สร้างระบบทำงานแบบ Ticket + Phase + Queue โดยปลอดภัย ฟรี และไม่ทำให้เครื่องค้าง

ข้อบังคับ:
- ใช้เฉพาะฟรี / OSS / Free-tier
- ห้ามมีค่าใช้จ่าย ห้ามใช้บัตรเครดิต
- inspect-first, classify-first, approval-before-destructive-change
- ห้ามติดตั้งอะไรหนักก่อนตรวจสเปคเครื่อง
- งานทุกงานต้องมี run_id และ lock_key
- บันทึกสถานะลง CSV ทุกครั้ง
- จำกัดงาน AI พร้อมกันไม่เกิน 1 งาน
- ถ้า fail ซ้ำ 3 ครั้ง ให้หยุดและส่งเข้า review

โครงสร้างสถานะ Ticket:
- backlog
- planning
- working
- review
- blocked
- retry
- done

ไฟล์ CSV ที่ต้องดูแล:
- task_queue.csv
- run_log.csv
- install_status.csv
- incident_log.csv

ลำดับเฟส:
- P1 SPEC_AUDIT
- P2 ENV_AUDIT
- P3 INSTALL_PLAN
- P4 SAFE_INSTALL
- P5 VALIDATE
- P6 FIX_RETRY
- P7 REPORT
- P8 UPDATE_QUEUE

เริ่มทำงานทันทีที่ P1 และยังไม่ติดตั้งอะไรจนกว่าจะจบ P3 และได้รับการอนุมัติ

---

## P1 — SPEC_AUDIT

ทำเฟส P1: SPEC_AUDIT

งานที่ต้องทำ:
1) ตรวจ CPU / RAM / พื้นที่ว่างดิสก์ / GPU / ระบบปฏิบัติการ
2) ประเมินความเสี่ยงการรัน AI local (low / medium / high)
3) แนะนำโปรไฟล์โมเดล:
   - Light (เครื่องไม่แรง)
   - Medium (เครื่องกลาง)
4) สรุปข้อจำกัดที่อาจทำให้เครื่องค้าง

ผลลัพธ์ที่ต้องส่ง:
- A) รายงานสเปคเครื่องแบบอ่านง่าย
- B) risk level
- C) model profile ที่แนะนำ
- D) ข้อเสนอป้องกันเครื่องค้าง

อัปเดต CSV:
- เพิ่มงานใน task_queue.csv (phase=P1, status=done เมื่อเสร็จ)
- บันทึก run_log.csv ทุก step

---

## P2 — ENV_AUDIT

ทำเฟส P2: ENV_AUDIT

งานที่ต้องทำ:
1) ตรวจการมีอยู่และเวอร์ชันของ:
   - git
   - python
   - node
   - npm
   - docker (ถ้ามี)
2) ตรวจ PATH และสิทธิ์โฟลเดอร์ทำงาน
3) ตรวจพอร์ตที่อาจชนกัน: 3000, 5432, 5678, 8000, 11434
4) ตรวจโปรเซสค้าง/บริการค้างที่เกี่ยวกับ dev stack
5) สรุป readiness เป็น:
   - ready
   - partial
   - not-ready

ผลลัพธ์ที่ต้องส่ง:
- A) ตารางความพร้อมเครื่องมือ
- B) ปัญหาที่พบ + วิธีแก้
- C) สรุปก่อนเข้าเฟสติดตั้ง

อัปเดต CSV:
- task_queue.csv
- run_log.csv
- incident_log.csv (ถ้าพบปัญหา)

---

## P3 — INSTALL_PLAN

ทำเฟส P3: INSTALL_PLAN

โจทย์:
- ออกแบบแผนติดตั้งแบบปลอดภัยและเบาเครื่อง สำหรับ Studio365 local-first

เงื่อนไข:
- ฟรี 100%
- ติดตั้งทีละชุดเล็ก
- ทุกขั้นมี checkpoint ทดสอบ
- มี fallback ถ้าขั้นใดล้มเหลว

ลำดับแนะนำ:
1) พื้นฐาน dev tools
2) database/cache
3) automation
4) local AI runtime แบบเบา
5) app services

ผลลัพธ์ที่ต้องส่ง:
- A) แผนติดตั้งทีละขั้น (Step-by-step)
- B) checkpoint ของแต่ละขั้น
- C) rollback plan แบบไม่ทำลายข้อมูล
- D) จุดที่ต้องอนุมัติก่อนทำจริง

อัปเดต CSV:
- task_queue.csv (สร้าง ticket ย่อยสำหรับ P4/P5/P6)
- install_status.csv (planned_version)

---

## P4 — SAFE_INSTALL

ทำเฟส P4: SAFE_INSTALL ตามแผนที่อนุมัติแล้วเท่านั้น

ข้อบังคับ:
- ติดตั้งทีละส่วน ห้ามยิงรวดเดียว
- หลังติดตั้งแต่ละส่วน ให้รัน health check ทันที
- ถ้า RAM / CPU เกิน threshold ให้ pause อัตโนมัติ
- ถ้าล้มเหลว ให้บันทึก incident และไป P6 เฉพาะจุด

รายงานต่อขั้น:
1) ติดตั้งอะไร
2) เวอร์ชันที่ได้
3) ผล health check
4) ผลกระทบทรัพยากรเครื่อง
5) pass/fail

อัปเดต CSV:
- install_status.csv (installed_version, status)
- run_log.csv
- incident_log.csv (เมื่อ fail)
- task_queue.csv

---

## P5 — VALIDATE

ทำเฟส P5: VALIDATE

งานที่ต้องทดสอบ:
1) บริการพื้นฐานตอบสนองได้
2) workflow automation เรียกได้
3) queue ทำงานได้
4) AI local ตอบได้ในเวลาที่รับได้
5) ระบบไม่กินทรัพยากรเกินจนค้าง

รูปแบบผลทดสอบ:
- test_name
- command/check method
- expected
- actual
- pass/fail
- หมายเหตุ

สรุปท้าย:
- พร้อมใช้งาน / พร้อมบางส่วน / ยังไม่พร้อม

อัปเดต CSV:
- run_log.csv
- task_queue.csv
- incident_log.csv (ถ้ามี)

---

## P6 — FIX_RETRY

ทำเฟส P6: FIX_RETRY

กติกา:
- แก้เฉพาะจุดที่ fail
- retry แบบจำกัดรอบ (สูงสุด 3 รอบต่อปัญหา)
- ถ้าเกิน 3 รอบ ให้ส่งเข้า review พร้อมข้อเสนอทางเลือก

ผลลัพธ์ที่ต้องส่ง:
- A) root cause ต่อปัญหา
- B) วิธีแก้ที่ทำ
- C) ผล retry
- D) ทางเลือก fallback หากยัง fail

อัปเดต CSV:
- incident_log.csv (retry_count, final_state)
- run_log.csv
- task_queue.csv

---

## P7 — REPORT

ทำเฟส P7: REPORT

สร้างรายงานสรุปสำหรับผู้ใช้:
1) สิ่งที่ทำเสร็จแล้ว
2) สิ่งที่ยังค้าง
3) ความเสี่ยงที่เหลือ
4) ภาระเครื่อง (resource usage overview)
5) แผนแนะนำถัดไป (Next 3 actions)

รูปแบบ:
- สั้น กระชับ อ่านง่าย
- แยกหัวข้อชัดเจน
- มีสถานะสี: done / warning / blocked

อัปเดต CSV:
- task_queue.csv
- run_log.csv

---

## P8 — UPDATE_QUEUE

ทำเฟส P8: UPDATE_QUEUE

งานที่ต้องทำ:
1) ปิด ticket ที่ done
2) ย้าย blocked/retry ไปคิวที่เหมาะสม
3) จัดลำดับความสำคัญงานรอบถัดไป
4) สร้าง ticket ใหม่จากข้อเสนอในรายงาน P7

เงื่อนไข:
- ต้องมี owner ชัดเจน
- ต้องมี due/priority
- ต้องมี depends_on ถ้ามี dependency

ผลลัพธ์:
- A) task_queue.csv เวอร์ชันล่าสุด
- B) รายการ Top 5 งานที่ควรทำต่อทันที

---

## Prompt เสริม: โหมด “ไม่ให้เครื่องค้าง”

เปิดโหมด Safe Resource สำหรับทุกงาน:
- จำกัด concurrent AI jobs = 1
- จำกัด timeout ต่อรอบ = 90 วินาที
- ถ้า RAM ว่างต่ำกว่า 25% ให้หยุดงาน AI ที่หนักทันที
- ถ้า CPU สูงต่อเนื่องเกิน threshold ให้พักงาน 60 วินาทีแล้วค่อยทำต่อ
- ใช้โมเดล Local แบบ Light ก่อนเสมอ
- ทุกครั้งที่ fallback ให้บันทึกเหตุผลใน run_log.csv

## Prompt เสริม: โหมด “รายงานประจำวัน”

สร้าง Daily Ops Report จาก CSV ทั้งหมด:
- จำนวนงานทั้งหมด / done / blocked / retry
- ปัญหาที่เกิดบ่อยที่สุด 3 อันดับ
- เวลาที่ใช้ต่อเฟส
- สถานะความพร้อมระบบวันนี้
- แผนงานพรุ่งนี้ (3 งานสำคัญ)
