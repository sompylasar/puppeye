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

const URL_ENTRY = 'file://' + __dirname + '/fixtures/smoke.html';

describe('Smoke test', () => {
  jest.setTimeout(120000);
  test('does not burn', async () => {
    const browserModel = await __getPuppeteerBrowser();
    const pageModel = await puppeye.makePageModel(browserModel, URL_ENTRY);

    const viewportCenterPoint = {
      x: 0.5 * browserModel.viewportSize.x,
      y: 0.5 * browserModel.viewportSize.y,
    } as puppeye.TViewportPoint;

    try {
      const textUser = makeTestUser();

      const fillOutLabeledField = async (
        pageModel: puppeye.TPageModel,
        label: string,
        value: string,
      ) => {
        const { element: inputElement } = await puppeye.findElementBelowLabel(
          pageModel,
          pageModel.mouseViewportPoint,
          puppeye.annotate(
            (el: puppeye.TPageElement) => el.textNormalized === puppeye.normalizeText(label),
            { label },
          ),
          (el) => el.nodeName === 'input',
        );
        await puppeye.fillOutInput(pageModel, inputElement, value);
        await puppeye.takeScreenshot(pageModel, 'filled-out-' + label);
      };

      await puppeye.debugDelay(pageModel, 5000);

      await fillOutLabeledField(pageModel, 'First Name', textUser.first_name);
      await fillOutLabeledField(pageModel, 'Last Name', textUser.last_name);
      await fillOutLabeledField(pageModel, 'Phone', textUser.phone_number);
      await fillOutLabeledField(pageModel, 'Email Address', textUser.email);
      await fillOutLabeledField(pageModel, 'Password', textUser.password);

      await puppeye.debugDelay(pageModel, 5000);

      {
        const {
          element: dropdownElement,
          labelElement: dropdownLabelElement,
        } = await puppeye.findElementBelowLabel(
          pageModel,
          pageModel.mouseViewportPoint,
          (el) => el.textNormalized === puppeye.normalizeText('How did you hear about us?'),
          (el) => el.textNormalized === 'select',
        );
        expect(dropdownLabelElement).toMatchObject({
          text: 'How did you hear about us?',
        });
        expect(dropdownElement).toMatchObject({
          text: 'Select',
        });

        await puppeye.clickElement(pageModel, dropdownElement);

        const [dropdownItemElement] = await puppeye.findElementsWithScrolling(
          pageModel,
          (pageModel) =>
            puppeye.findElements(
              pageModel,
              puppeye.makeElementsBelowFinder({
                viewportPoint: puppeye.convertPagePointToViewportPoint(
                  pageModel,
                  dropdownElement.centerPagePoint,
                ),
                filter: (el) => el.textNormalized === puppeye.normalizeText('Other'),
              }),
            ),
        );
        expect(dropdownItemElement).toMatchObject({
          text: 'Other',
        });

        debug('dropdownItemElement:', puppeye.debugToStringElement(dropdownItemElement));

        await puppeye.clickElement(pageModel, dropdownItemElement);

        const [checkboxLabelElement] = await puppeye.findElementsWithScrolling(
          pageModel,
          (pageModel) =>
            puppeye.findElements(
              pageModel,
              puppeye.makeElementsBelowFinder({
                viewportPoint: puppeye.convertPagePointToViewportPoint(
                  pageModel,
                  dropdownElement.centerPagePoint,
                ),
                filter: (el) => el.textNormalized.indexOf(puppeye.normalizeText('I agree')) === 0,
              }),
            ),
        );

        await puppeye.moveMouseIntoElementRect(pageModel, checkboxLabelElement);

        const [checkboxElement] = puppeye.findElements(
          pageModel,
          puppeye.makeElementsAroundFinder({
            viewportPoint: puppeye.convertPagePointToViewportPoint(pageModel, {
              x: checkboxLabelElement.pageRect.left,
              y: checkboxLabelElement.centerPagePoint.y,
            } as puppeye.TPagePoint),
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
              pageModel,
              checkboxLabelElement.centerPagePoint,
            ),
            filter: (el) =>
              el.isInteractive && el.textNormalized === puppeye.normalizeText('Continue'),
          }),
        );
        expect(continueButton).toMatchObject({
          text: 'Continue',
        });
      }

      await puppeye.debugDelay(pageModel, 5000);
    } catch (ex) {
      await puppeye.handleError(pageModel, ex);
    }
  });
});
