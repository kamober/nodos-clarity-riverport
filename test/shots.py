from playwright.sync_api import sync_playwright
import sys
views=['recientes','historico','cumplimiento','ubicaciones','calidad','importar']
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--no-sandbox'])
    pg=b.new_page(viewport={'width':1400,'height':900})
    errs=[]
    pg.on('pageerror',lambda e:errs.append('PAGEERROR '+str(e)))
    pg.on('console',lambda m:errs.append(m.text) if m.type=='error' and 'ERR_' not in m.text and 'Failed to load resource' not in m.text else None)
    for v in views:
        pg.goto('http://localhost:8898/#'+v); pg.reload(); pg.wait_for_timeout(1200)
        pg.screenshot(path=f'/tmp/v_{v}.png',full_page=(v!='historico' and v!='recientes'))
    print('ERRORS',errs)
    b.close()
