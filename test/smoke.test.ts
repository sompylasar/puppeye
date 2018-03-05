import * as createDebug from 'debug';
import * as puppeye from '../src/index';

const debug = createDebug('__tests__:' + __filename);

function makeTestUser() {
  const date = puppeye.nowDateIso();
  return {
    email: 'puppeye.test.' + date + '@yopmail.com',
    password: 'password',
    first_name: 'Test ' + date,
    last_name: 'Test ' + date,
    phone_number: '5555555555',
  };
}

async function fillOutLabeledField(pageModel: puppeye.TPageModel, label: string, value: string) {
  const { element: inputElement } = await puppeye.findElementBelowLabel(
    pageModel,
    pageModel.getPageState().mousePointer.viewportPoint,
    puppeye.filterReadsLike(label),
    puppeye.filterLooksLikeTextInput(),
  );
  await puppeye.fillOutInput(pageModel, inputElement, value);
  await pageModel.waitForNextPageState();
  const inputElementAgain = await puppeye.findElementAgain(pageModel, inputElement);
  expect(inputElementAgain).toMatchObject({
    text: `@@value@@${value}`,
  });
  await puppeye.takeScreenshot(pageModel, 'filled-out-' + label);
}

describe('Smoke test', () => {
  jest.setTimeout(120000);

  const URL_ENTRY = 'file://' + __dirname + '/fixtures/smoke.html';

  test('does not burn', async () => {
    const browserModel = await __getPuppeteerBrowser();
    const pageModel = await puppeye.makePageModel(browserModel, URL_ENTRY);

    const viewportCenterPoint = {
      x: 0.5 * browserModel.viewportSize.x,
      y: 0.5 * browserModel.viewportSize.y,
    } as puppeye.TViewportPoint;

    try {
      const textUser = makeTestUser();

      await puppeye.debugDelay(pageModel, 2000);

      await fillOutLabeledField(pageModel, 'First Name', textUser.first_name);
      await fillOutLabeledField(pageModel, 'Last Name', textUser.last_name);
      await fillOutLabeledField(pageModel, 'Phone', textUser.phone_number);
      await fillOutLabeledField(pageModel, 'Email Address', textUser.email);
      await fillOutLabeledField(pageModel, 'Password', textUser.password);

      {
        const {
          element: dropdownElement,
          labelElement: dropdownLabelElement,
        } = await puppeye.findElementBelowLabel(
          pageModel,
          pageModel.getPageState().mousePointer.viewportPoint,
          puppeye.filterReadsLike('How did you hear about us?'),
          puppeye.filterLooksLikeDropdown(),
        );
        expect(dropdownLabelElement).toMatchObject({
          text: 'How did you hear about us?',
        });
        expect(dropdownElement).toMatchObject({
          text: 'Select',
        });

        if (dropdownElement.nodeName === 'select') {
          const dropdownElementHandle = (await pageModel.page.$x(dropdownElement.xpath))[0];
          if (!dropdownElementHandle) {
            throw new Error('Unable to find dropdownElement by xpath ' + dropdownElement.xpath);
          }
          await pageModel.page.evaluate((element: HTMLSelectElement) => {
            const options = Array.from(element.options);
            const optionElFound = options.filter(
              (optionEl: HTMLOptionElement) => optionEl.innerText === 'Other',
            )[0];
            if (optionElFound) {
              const options = Array.from(element.options);
              if (element.multiple) {
                for (const option of options) {
                  option.selected = option === optionElFound;
                }
              } else {
                element.value = optionElFound.value;
              }
              element.dispatchEvent(new Event('input', { bubbles: true }));
              element.dispatchEvent(new Event('change', { bubbles: true }));
              return optionElFound.value;
            }
            return null;
          }, dropdownElementHandle);
        } else {
          await puppeye.clickElement(pageModel, dropdownElement);

          const [dropdownItemElement] = await puppeye.findElementsWithScrolling(
            pageModel,
            async (pageModel) =>
              puppeye.findElements(
                pageModel,
                puppeye.makeElementsBelowFinder({
                  viewportPoint: puppeye.convertPagePointToViewportPoint(
                    pageModel.getPageState(),
                    dropdownElement.centerPagePoint,
                  ),
                  filter: puppeye.filterReadsLike('Other'),
                }),
              ),
          );
          expect(dropdownItemElement).toMatchObject({
            text: 'Other',
          });

          debug('dropdownItemElement:', puppeye.debugToStringElement(dropdownItemElement));

          await puppeye.clickElement(pageModel, dropdownItemElement);
        }

        await pageModel.waitForNextPageState();

        const [checkboxLabelElement] = await puppeye.findElementsWithScrolling(
          pageModel,
          async (pageModel) =>
            puppeye.findElements(
              pageModel,
              puppeye.makeElementsBelowFinder({
                viewportPoint: puppeye.convertPagePointToViewportPoint(
                  pageModel.getPageState(),
                  dropdownElement.centerPagePoint,
                ),
                filter: (el) => el.textNormalized.indexOf(puppeye.normalizeText('I agree')) === 0,
              }),
            ),
        );

        await puppeye.moveMouseIntoElementRect(pageModel, checkboxLabelElement);

        const checkboxLabelCenterLeftPagePoint = {
          x: checkboxLabelElement.pageRect.left,
          y: checkboxLabelElement.centerPagePoint.y,
        } as puppeye.TPagePoint;
        const [checkboxElement] = await puppeye.findElements(
          pageModel,
          puppeye.makeElementsAroundFinder({
            viewportPoint: puppeye.convertPagePointToViewportPoint(
              pageModel.getPageState(),
              checkboxLabelCenterLeftPagePoint,
            ),
            filter: (el) =>
              el.viewportRect.area > 10 * 10 &&
              el.viewportRect.area < 40 * 40 &&
              el.viewportRect.ratio > 0.9,
            maxDistancePx: 100,
          }),
        );

        await puppeye.moveMouseIntoElementRect(pageModel, checkboxElement);

        await puppeye.clickElement(pageModel, checkboxElement);

        const [continueButton] = await puppeye.findElements(
          pageModel,
          puppeye.makeElementsBelowFinder({
            viewportPoint: puppeye.convertPagePointToViewportPoint(
              pageModel.getPageState(),
              checkboxLabelElement.centerPagePoint,
            ),
            filter: (el) =>
              el.isInteractive && el.textNormalized === puppeye.normalizeText('Continue'),
          }),
        );
        expect(continueButton).toMatchObject({
          text: 'Continue',
        });

        await puppeye.clickElement(pageModel, continueButton);
      }

      await puppeye.debugDelay(pageModel, 5000);
    } catch (ex) {
      await puppeye.handleError(pageModel, ex);
    }
  });
});
