from playwright.sync_api import sync_playwright
U='/mnt/user-data/uploads/'
files=[U+'aa59dadc-JBXWQEMWEQ.csv',U+'e845f1ee-JB72VQIKWA.csv',U+'6abfea8c-JBXYK18HAZ.csv']
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--no-sandbox'])
    pg=b.new_page(viewport={'width':1400,'height':900}); errs=[]
    pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto('http://localhost:8898/#recientes'); pg.wait_for_timeout(800)
    print('vacío ->',pg.inner_text('.banner')[:90].replace('\n',' '))
    pg.goto('http://localhost:8898/#importar'); pg.wait_for_timeout(500)
    pg.set_input_files('#file',files); pg.wait_for_function("document.querySelectorAll('#plist tbody tr').length==3",timeout=30000)
    pg.fill('#token','mal'); pg.click('#save'); pg.wait_for_timeout(1500)
    print('token malo ->',pg.inner_text('#plist tbody tr:first-child td:last-child'))
    pg.fill('#token','dev')
    # reintentar: los que fallaron quedan con error y sin saved
    pg.click('#save'); pg.wait_for_function("[...document.querySelectorAll('#plist tbody tr td:last-child')].every(t=>t.innerText.includes('horas guardadas'))",timeout=60000)
    print('guardado ->',[t for t in pg.eval_on_selector_all('#plist tbody tr td:last-child','x=>x.map(e=>e.innerText)')])
    pg.screenshot(path='/tmp/imp_ok.png')
    pg.goto('http://localhost:8898/#cumplimiento'); pg.reload(); pg.wait_for_timeout(1500)
    rows=pg.eval_on_selector_all('#view table.m tbody tr','trs=>trs.map(tr=>[...tr.children].map(td=>td.innerText.replace(/\\n+/g," | ").slice(0,60)))')
    for r in rows[:2]: print(r)
    pg.goto('http://localhost:8898/#ubicaciones'); pg.reload(); pg.wait_for_timeout(800)
    pg.fill('#token','dev'); inp=pg.locator('input[data-name="A4THH3V9"]'); inp.fill('Carbon (norte)'); pg.click('button[data-save="A4THH3V9"]'); pg.wait_for_timeout(600)
    print('renombrar ->',pg.inner_text('#usv'))
    print('ERRORS',errs); b.close()
