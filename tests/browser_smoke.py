"""Smoke-test the imported LDS game in real Chromium without student data."""
import json
import shutil
from playwright.sync_api import sync_playwright,expect

ROOT='http://127.0.0.1:8765/'
with sync_playwright() as pw:
    chrome=shutil.which('google-chrome') or shutil.which('chromium') or shutil.which('chromium-browser')
    assert chrome, 'A system Chrome/Chromium binary is required'
    browser=pw.chromium.launch(headless=True,executable_path=chrome,args=['--no-sandbox','--disable-dev-shm-usage'])
    ctx=browser.new_context(viewport={'width':1440,'height':900})
    page=ctx.new_page()
    errors=[]
    bad_assets=[]
    page.on('pageerror',lambda error: errors.append(str(error)))
    page.on('response',lambda response: bad_assets.append((response.status,response.url))
        if response.status>=400 and response.url.startswith(ROOT) else None)
    res=page.goto(ROOT,wait_until='networkidle',timeout=30000)
    assert res.status==200
    expect(page).to_have_title('Race Around the Large Data Set')
    expect(page.locator('#space-1')).to_be_visible()
    assert page.locator('#board article[id^="space-"]').count()==32
    # All eight dynamically loaded weather station photographs are required.
    photos=page.locator('#board img')
    expect(photos).to_have_count(8)
    good=photos.evaluate_all('(images) => images.every(img => img.complete && img.naturalWidth > 0)')
    assert good, 'One or more LDS station photographs did not load'
    page.locator('#helpButton').click()
    expect(page.locator('#rulesDialog')).to_be_visible()
    page.locator('#rulesDialog button.close').click()
    expect(page.locator('#rulesDialog')).to_be_hidden()
    page.locator('[data-open-review]').first.click()
    expect(page.locator('#reviewMode')).to_be_visible()
    page.locator('#reviewMode [data-review-deck="station"]').click()
    expect(page.locator('#reviewMode [data-review-toggle-answer]')).to_be_visible()
    page.locator('#reviewMode [data-review-toggle-answer]').click()
    expect(page.locator('#reviewMode [data-review-toggle-answer]')).to_have_text('Hide Answer')
    page.locator('#reviewMode [data-review-back-board]').click()
    expect(page.locator('#reviewMode')).to_be_hidden()
    page.locator('#motionToggle').check()
    page.locator('#teamCount').select_option('4')
    page.locator('#startButton').click()
    expect(page.locator('#scoreboard')).to_contain_text('Orange Team')
    page.locator('#rollButton').click()
    page.wait_for_function("() => /^[1-6]$/.test(document.querySelector('#diceDisplay').textContent.trim())",timeout=15000)
    assert not errors, 'Browser JavaScript errors: '+json.dumps(errors)
    assert not bad_assets, 'Missing or failed imported assets: '+json.dumps(bad_assets)
    print('BROWSER_SMOKE='+json.dumps({
      'title':'Race Around the Large Data Set','boardSpaces':32,
      'photosLoaded':8,'rules':'PASS','cardReview':'PASS',
      'fourTeams':'PASS','diceRoll':'PASS','jsErrors':0,
      'failedAssets':0,'status':'PASS'
    }))
    browser.close()
