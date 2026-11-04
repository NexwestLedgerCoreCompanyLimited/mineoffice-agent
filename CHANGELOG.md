# Changelog

## 0.2.1

### เพิ่มอะไรบ้าง

- อัปเดตในตัวแอป: Windows และ AppImage โหลดเวอร์ชันใหม่เอง แล้วกดรีสตาร์ทเพื่ออัปเดต ส่วน macOS และ .deb แอปจะแจ้งเตือนให้ไปโหลด
- ลิงก์ดาวน์โหลดตรงที่ได้เวอร์ชันล่าสุดเสมอ
- README ภาษาไทย ภาพตัวอย่างการใช้งาน และหน้าผู้สร้าง

### แก้ไขอะไรบ้าง

- Release ตั้งเป็น Latest แล้ว ไม่ใช่ Pre-release

### Added

- Updates inside the app. Windows and the AppImage download a new version and offer Restart to update. macOS and .deb tell you to download it
- Download links that always give the newest version
- A Thai README, screenshots of the app, and who made it

### Fixed

- Releases are now marked Latest instead of Pre-release

### Not tested yet

- Live AI services with a real key, and all 30 characters in one world at once
- A real update on Windows or the AppImage, which needs two published versions

## 0.2.0

### เพิ่มอะไรบ้าง

- ทีมใหม่ 7 คน รวมเป็น 30 คน ใน 3 แผนกใหม่: แอดมินและดูแลลูกค้า, การตลาดและคอนเทนต์, ครีเอทีฟ
- แอดมินสำนักงาน แอดมินดูแลลูกค้า แอดมินโซเชียลมีเดีย นักเขียนคอนเทนต์ นักการตลาด นักออกแบบกราฟิก และผู้ผลิตวิดีโอ
- สั่งงานธุรกิจได้จากโหมด Project โดย Commander จะข้ามขั้นตอนซอฟต์แวร์และส่งงานให้ผู้รับผิดชอบโดยตรง
- โลโก้กำกับ AI แต่ละเจ้าในหน้าตั้งค่า หน้าเริ่มต้น และหน้าทีม ทำให้เห็นว่าพนักงานแต่ละคนใช้ AI เจ้าไหน
- ตั้งชื่อโมเดลเองได้ทุกเจ้าในหน้าตั้งค่า AI

### แก้ไขอะไรบ้าง

- OpenRouter: โมเดลฟรีเดิมถูกถอดออกทั้งหมด จึงเปลี่ยนไปใช้ `openrouter/free`
- Claude: เลิกส่ง `temperature` ที่รุ่นปัจจุบันปฏิเสธ และอ่านคำตอบได้ถูกต้องเมื่อมีช่วงคิดนำหน้า
- OpenAI: เปลี่ยนเป็น GPT-6 Luna และส่งพารามิเตอร์ตามที่รุ่นใหม่รับ โดยบริการที่เข้ากันได้กับ OpenAI ยังใช้ของเดิม
- Gemini: เปลี่ยนเป็น Gemini 3.8 Flash และย้าย API key ออกจาก URL ไปไว้ใน header
- ค่าโมเดลเก่าที่บันทึกไว้จะย้ายไปรุ่นปัจจุบันโดยอัตโนมัติ
- หน้าสถานะแสดงภาพพนักงานครบทุกคน จากเดิมที่แสดงแค่ 6 คนแรก
- คำสั่งติดตั้งไม่ชี้ไปที่แพ็กเกจ npm ที่ยังไม่มีอีกต่อไป

### ใบอนุญาต

- เปลี่ยนเป็น Business Source License 1.1: ใช้ ดัดแปลง และหารายได้จากการใช้งานได้ แต่ห้ามขายตัวโปรแกรม
- แต่ละเวอร์ชันจะเปลี่ยนเป็น Apache License 2.0 เมื่อครบ 4 ปี โดยเวอร์ชันนี้คือ 2030-11-05

### ยังไม่ได้ทดสอบ

- ยังไม่ได้ทดสอบกับ AI จริงด้วย API key และยังไม่ได้ลองให้ทั้ง 30 คนเข้าโลก Minecraft พร้อมกัน

### Added

- Seven new team members in three new departments, making 30: Office Administrator, Customer Support, Social Media Manager, Content Writer, Marketing Specialist, Graphic Designer and Video Producer
- Business work from Project mode, where the Commander skips the software steps
- A logo for each AI service in AI Settings, Setup and Team, including which service each team member uses
- A model name field for every AI service

### Fixed

- OpenRouter: every old free model is gone, so the default is now `openrouter/free`
- Claude: no longer sends `temperature`, which current models reject, and finds the answer after a thinking block. A refusal is now an error
- OpenAI: defaults to `gpt-6-luna` and sends the fields it accepts. Compatible services keep the older fields
- Gemini: defaults to `gemini-3.8-flash`, reads answers made of several parts, and sends the key in a header instead of the URL
- Saved settings that name a retired model move to the current one
- The status page shows a picture for everyone, not only the first six
- The install command no longer points to an npm package that does not exist

### Changed

- License: Business Source License 1.1. Use it, change it and earn money with it, but do not sell it. Each version becomes Apache License 2.0 four years after release, which is 2030-11-05 for this one

### Not tested yet

- Live AI services with a real key, and all 30 characters in one world at once

## 0.1.0

Early release, not published. See "What has been tested" in the README for what has and has not been run on a real server.

- A team of 23 AI characters across product, design, engineering and quality, with enforced roles
- Whole-project mode: tasks with dependencies run in parallel on a shared branch, with approvals for requirements and design, Tech Lead review, and one final review
- Images on goals and in projects, for OpenRouter, Gemini, Claude, OpenAI and Ollama
- Office staff can join local worlds as characters and report in chat
- In-game agents that work in a loop and change course when a step fails
- 24 in-game skills, including chests, furnaces, farming, eating and fleeing
- Outside tools through MCP, over stdio and HTTP, with allow, ask and deny permissions
- Team memory kept per server: facts, places, notes and saved routines
- Code tasks on a separate Git branch, merged only after you review the real diff
- Local and public servers, with offline and Microsoft accounts
- Desktop app, headless Linux mode, Docker and systemd setups
- MCP server so other AI tools can control MineOffice
- Read-only status page that can be shared by IP address
- English and Thai
- MineOffice Business License: use it to make money, but do not sell it
