# Min Voice — เกมเสียงข้างน้อย

เกมโหวตแบบเรียลไทม์: ทุกรอบมี 2 ตัวเลือก ฝั่งที่คนเลือก**น้อยกว่า**รอด ฝั่งเสียงข้างมากและคนที่ไม่ตอบตกรอบ
เล่นจนเหลือผู้รอดคนเดียว

- ผู้เล่น (มือถือ): https://min-voice.codeinsane.dev/
- หลังบ้านแอดมิน: https://min-voice.codeinsane.dev/admin

## เริ่มใช้งาน

```bash
npm install
npm run dev        # server :3000 + Vite :5173 (เปิด http://localhost:5173)
```

Production:

```bash
npm run build
npm start          # http://localhost:3000 (PORT ปรับได้)
```

## รหัสผ่านแอดมิน

- รหัสผ่านเริ่มต้นคือ **`changeme`**
- เปลี่ยนได้ที่หลังบ้าน → **ตั้งค่า** (`/admin/settings`) ต้องใส่รหัสเดิม และรหัสใหม่ยาวอย่างน้อย 8 ตัวอักษร
- ระหว่างที่ยังใช้รหัสเริ่มต้น หลังบ้านจะแสดงแถบเตือน
- เปลี่ยนรหัสแล้ว อุปกรณ์อื่นที่ล็อกอินค้างไว้จะถูกออกจากระบบ
- รหัสผ่านเก็บแบบ hash (scrypt + salt) ใน `data/store.json`
- ลืมรหัสผ่าน: หยุดเซิร์ฟเวอร์ แล้วลบส่วน `admin` ใน `data/store.json` (หรือลบทั้งไฟล์ ซึ่งจะลบคำถามและประวัติด้วย) รหัสจะกลับเป็น `changeme`

## กติกา

- ทุกรอบมี 2 ตัวเลือก เวลาตามที่ตั้งไว้ต่อคำถาม (ค่าเริ่มต้น 10 วินาที) เปลี่ยนคำตอบได้จนกว่าจะหมดเวลา
- ฝั่งที่คนเลือกน้อยกว่ารอด ส่วนฝั่งที่มากกว่าและคนที่ไม่ตอบตกรอบ
- ถ้าเสมอ 50/50 ทุกคนเลือกฝั่งเดียวกัน หรือไม่มีใครตอบ: ทุกคนรอดและเล่นรอบใหม่
- คนที่ตกรอบดูเกมต่อในโหมดผู้ชมได้ อันดับเรียงตามรอบที่ตกรอบ (ตกรอบเดียวกันได้อันดับเท่ากัน)
- เกมจบเมื่อเหลือ 1 คน คำถามหมด หรือแอดมินกด “จบเกม” (ผู้ที่ยังอยู่เป็นผู้ชนะร่วม)
- คนที่เข้ามาระหว่างเกมจะดูในโหมดผู้ชม และได้เล่นในเกมถัดไป

## โครงสร้าง

```
server/   Express + Socket.IO (game.ts = กติกา/สถานะเกม, store.ts = ไฟล์ข้อมูล + รหัสผ่าน)
shared/   types ที่ client กับ server ใช้ร่วมกัน
src/      React (player/ = จอมือถือ, admin/ = หลังบ้าน)
data/     store.json (คำถาม, ประวัติเกม, hash รหัสผ่าน) สร้างอัตโนมัติ
```

สถานะเกมอยู่ในหน่วยความจำของเซิร์ฟเวอร์ตัวเดียว จึงควรรันเป็น process เดียว (VPS, Docker, Railway, Fly ฯลฯ)
ไม่เหมาะกับ serverless ที่มีหลาย instance

## Deploy ที่ min-voice.codeinsane.dev

รัน `npm run build && npm start` (พอร์ต 3000) แล้วตั้ง reverse proxy ให้โดเมนชี้มาที่พอร์ตนี้
**ต้องเปิด WebSocket upgrade** สำหรับ `/socket.io/` ด้วย ตัวอย่าง Nginx:

```nginx
server {
  server_name min-voice.codeinsane.dev;
  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```

(Caddy: `min-voice.codeinsane.dev { reverse_proxy 127.0.0.1:3000 }` ใช้ได้เลย รองรับ WebSocket และ HTTPS อัตโนมัติ)
