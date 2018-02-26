import * as createDebug from 'debug';
import * as pptu from '../index';

const debug = createDebug('__tests__:' + __filename);

function makeTestUser() {
  const date = pptu.nowDateIso();
  return {
    email: 'pptu.test.' + date + '@yopmail.com',
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
    const browserModel = await __ppt();
    const pageModel = await pptu.makePageModel(browserModel, URL_ENTRY);

    const viewportCenterPoint = {
      x: 0.5 * browserModel.viewportSize.x,
      y: 0.5 * browserModel.viewportSize.y,
    } as pptu.TViewportPoint;

    try {
      const textUser = makeTestUser();

      const fillOutLabeledField = async (
        pageModel: pptu.TPageModel,
        label: string,
        value: string,
      ) => {
        const { element: inputElement } = await pptu.findElementBelowLabel(
          pageModel,
          pageModel.mouseViewportPoint,
          pptu.annotate(
            (el: pptu.TPageElement) => el.textNormalized === pptu.normalizeText(label),
            { label },
          ),
          (el) => el.nodeName === 'input',
        );
        await pptu.fillOutInput(pageModel, inputElement, value);
        await pptu.takeScreenshot(pageModel, 'filled-out-' + label);
      };

      await pptu.debugDelay(pageModel, 5000);

      await fillOutLabeledField(pageModel, 'First Name', textUser.first_name);
      await fillOutLabeledField(pageModel, 'Last Name', textUser.last_name);
      await fillOutLabeledField(pageModel, 'Phone', textUser.phone_number);
      await fillOutLabeledField(pageModel, 'Email Address', textUser.email);
      await fillOutLabeledField(pageModel, 'Password', textUser.password);

      await pptu.debugDelay(pageModel, 5000);

      {
        const {
          element: dropdownElement,
          labelElement: dropdownLabelElement,
        } = await pptu.findElementBelowLabel(
          pageModel,
          pageModel.mouseViewportPoint,
          (el) => el.textNormalized === pptu.normalizeText('How did you hear about us?'),
          (el) => el.textNormalized === 'select',
        );
        expect(dropdownLabelElement).toMatchObject({
          text: 'How did you hear about us?',
        });
        expect(dropdownElement).toMatchObject({
          text: 'Select',
        });

        await pptu.clickElement(pageModel, dropdownElement);

        const [dropdownItemElement] = await pptu.findElementsWithScrolling(pageModel, (pageModel) =>
          pptu.findElements(
            pageModel,
            pptu.makeElementsBelowFinder({
              viewportPoint: pptu.convertPagePointToViewportPoint(
                pageModel,
                dropdownElement.centerPagePoint,
              ),
              filter: (el) => el.textNormalized === pptu.normalizeText('Other'),
            }),
          ),
        );
        expect(dropdownItemElement).toMatchObject({
          text: 'Other',
        });

        debug('dropdownItemElement:', pptu.debugToStringElement(dropdownItemElement));

        await pptu.clickElement(pageModel, dropdownItemElement);

        const [checkboxLabelElement] = await pptu.findElementsWithScrolling(
          pageModel,
          (pageModel) =>
            pptu.findElements(
              pageModel,
              pptu.makeElementsBelowFinder({
                viewportPoint: pptu.convertPagePointToViewportPoint(
                  pageModel,
                  dropdownElement.centerPagePoint,
                ),
                filter: (el) => el.textNormalized.indexOf(pptu.normalizeText('I agree')) === 0,
              }),
            ),
        );

        await pptu.moveMouseIntoElementRect(pageModel, checkboxLabelElement);

        const [checkboxElement] = pptu.findElements(
          pageModel,
          pptu.makeElementsAroundFinder({
            viewportPoint: pptu.convertPagePointToViewportPoint(pageModel, {
              x: checkboxLabelElement.pageRect.left,
              y: checkboxLabelElement.centerPagePoint.y,
            } as pptu.TPagePoint),
            filter: (el) =>
              el.viewportRect.area > 10 * 10 &&
              el.viewportRect.area < 40 * 40 &&
              el.viewportRect.ratio > 0.9,
            maxDistancePx: 100,
          }),
        );

        await pptu.moveMouseIntoElementRect(pageModel, checkboxElement);

        await pptu.clickElement(pageModel, checkboxElement);

        const [continueButton] = await pptu.findElements(
          pageModel,
          pptu.makeElementsBelowFinder({
            viewportPoint: pptu.convertPagePointToViewportPoint(
              pageModel,
              checkboxLabelElement.centerPagePoint,
            ),
            filter: (el) =>
              el.isInteractive && el.textNormalized === pptu.normalizeText('Continue'),
          }),
        );
        expect(continueButton).toMatchObject({
          text: 'Continue',
        });
      }

      await pptu.debugDelay(pageModel, 5000);
    } catch (ex) {
      await pptu.handleError(pageModel, ex);
    }
  });
});
