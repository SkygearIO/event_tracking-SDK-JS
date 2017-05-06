# Skygear Event Tracking

```js
import { SkygearEventTracker } from 'skygear-event-tracking';
import skygear from 'skygear';
const tracker = new SkygearEventTracker(skygear);
export default tracker; // you should only construct this instance once for your app.
```

```js
import skygearEventTracker from './skygearEventTracker';
skygearEventTracker.track('Hello, World!', {
  you_can_add_boolean: true,
  and_number: 1,
  and_string: 'for custom attribute.',
});
```
