// @flow
import qs from 'qs';
import objectAssign from 'object-assign';
import 'whatwg-fetch';

const STORAGE_KEY = '__SKYGEAR_EVENT_TRACKING__';
const DEFAULT_MAX_LENGTH = 1000;
const DEFAULT_FLUSH_LIMIT = 10;
const DEFAULT_UPLOAD_LIMIT = 20;
const DEFAULT_TIMER_INTERVAL = 30 * 1000; // in ms
const DEFAULT_MOUNT_PATH = '/skygear_event_tracking';

type SkygearUser = {
  id: string,
};

type SkygearContainer = {
  endPoint: string,
  currentUser: ?SkygearUser,
};

type BaseEvent = {
  _event_raw: string,
  _tracked_at: Date,
  _user_id: ?string,
};

type EnvironmentContext = {
  _page_path: ?string,
  _page_search: ?string,
  _page_url: ?string,
  _page_referrer: ?string,
  _utm_campaign: ?string,
  _utm_channel: ?string,
  _user_agent: ?string,
};

type UserDefinedAttributes = {
  [string]: ?string | ?number | ?boolean,
};

type DateObject = {
  $type: 'date',
  $date: string,
};

type EventJSON = {
  [string]: string | number | boolean | DateObject,
};

type Event = {
  ...BaseEvent,
  ...EnvironmentContext,
  ...UserDefinedAttributes,
};

type Task = () => Promise<mixed>;

type SerializedFormat = {
  events: Array<EventJSON>,
};

function _hasWindow(): boolean {
  return typeof window !== 'undefined';
}

function getPagePathname(): ?string {
  if (_hasWindow()) {
    return window.location.pathname;
  }
  return null;
}

function getPageSearch(): ?string {
  if (_hasWindow() && window.location.search) {
    return window.location.search;
  }
  return null;
}

function getPageURL(): ?string {
  if (_hasWindow()) {
    return window.location.href;
  }
  return null;
}

function getPageReferrer(): ?string {
  if (_hasWindow() && window.document.referrer) {
    return window.document.referrer;
  }
  return null;
}

function getUTMCampaign(): ?string {
  if (_hasWindow() && window.location.search) {
    const obj = qs.parse(window.location.search.slice(1));
    if (obj.utm_campaign) {
      return obj.utm_campaign;
    }
  }
  return null;
}

function getUTMChannel(): ?string {
  if (_hasWindow() && window.location.search) {
    const obj = qs.parse(window.location.search.slice(1));
    if (obj.utm_channel) {
      return obj.utm_channel;
    }
  }
  return null;
}

function getUserAgent(): ?string {
  if (_hasWindow() && window.navigator.userAgent) {
    return window.navigator.userAgent;
  }
  return null;
}

interface SyncStorage {
  setItem(key: string, value: string): void;
  getItem(key: string): ?string;
}

class WindowLocalStorage implements SyncStorage {
  setItem(key: string, value: string) {
    try {
      window.localStorage.setItem(key, value);
    } catch (e) {
      // ignore
    }
  }

  getItem(key: string): ?string {
    try {
      return window.localStorage.getItem(key);
    } catch (e) {
      return null;
    }
  }
}

class Executor {
  _promise: Promise<mixed>;

  constructor() {
    this._promise = Promise.resolve();
  }

  submit(task: Task): void {
    this._promise = this._promise.then(task, task);
  }
}

class Writer {
  _syncStorage: SyncStorage;
  _events: Array<Event>;
  _executor: Executor;
  _timerToken: ?number;
  _endpoint: string;

  constructor(syncStorage: SyncStorage, endpoint: string) {
    this._syncStorage = syncStorage;
    this._endpoint = endpoint;
    this._events = [];
    this._executor = new Executor();
    this._executor.submit(() => {
      return this._restore()
        .then(() => this._dropIfNeeded())
        .then(() => this._flushIfHasSomeEvents());
    });
    this._timerToken = setInterval(() => {
      this._executor.submit(() => {
        return this._flushIfHasSomeEvents();
      });
    }, DEFAULT_TIMER_INTERVAL);
  }

  _restore(): Promise<void> {
    const value = this._syncStorage.getItem(STORAGE_KEY);
    if (value) {
      try {
        const json = JSON.parse(value);
        if (json && json.events && Array.isArray(json.events)) {
          const jsonArray = json.events;
          for (const eventJson of jsonArray) {
            const event = this._fromJSONObject(eventJson);
            if (event) {
              this._events.push(event);
            }
          }
        }
      } catch (e) {
        // ignore
      }
    }
    return Promise.resolve();
  }

  _serializeDateToJSONObject(date: Date): DateObject {
    return {
      $type: 'date',
      $date: date.toISOString(),
    };
  }

  _parseDateFromJSONObject(dateObject: DateObject): ?Date {
    if (dateObject.$type === 'date') {
      if (typeof dateObject.$date === 'string') {
        const maybeDate = new Date(Date.parse(dateObject.$date));
        if (!isNaN(maybeDate.getTime())) {
          return maybeDate;
        }
      }
    }
    return null;
  }

  _fromJSONObject(eventJson: EventJSON): Event {
    const output = {};
    const keys = Object.keys(eventJson);
    for (const key of keys) {
      const value = eventJson[key];
      if (typeof value === 'boolean') {
        output[key] = value;
      } else if (typeof value === 'number') {
        output[key] = value;
      } else if (typeof value === 'string') {
        output[key] = value;
      } else if (typeof value === 'object' && value !== null) {
        const date = this._parseDateFromJSONObject(value);
        if (date) {
          output[key] = date;
        }
      }
    }
    return output;
  }

  _toJSONObject(event: Event): EventJSON {
    const output = {};
    const keys = Object.keys(event);
    for (const key of keys) {
      const value = event[key];
      if (typeof value === 'boolean') {
        output[key] = value;
      } else if (typeof value === 'number') {
        output[key] = value;
      } else if (typeof value === 'string') {
        output[key] = value;
      } else if (value instanceof Date) {
        output[key] = this._serializeDateToJSONObject(value);
      }
    }
    return output;
  }

  _serializeEvents(events: Array<Event>): SerializedFormat {
    const root = {
      events: [],
    };
    for (const event of events) {
      const eventJSON = this._toJSONObject(event);
      if (eventJSON) {
        root.events.push(eventJSON);
      }
    }
    return root;
  }

  _persist(): Promise<void> {
    const serializedFormat = this._serializeEvents(this._events);
    const value = JSON.stringify(serializedFormat);
    this._syncStorage.setItem(STORAGE_KEY, value);
    return Promise.resolve();
  }

  _dropIfNeeded(): Promise<void> {
    if (this._events.length > DEFAULT_MAX_LENGTH) {
      const originalLength = this._events.length;
      const startIndex = originalLength - DEFAULT_MAX_LENGTH;
      this._events = this._events.slice(startIndex);
    }
    return Promise.resolve();
  }

  _flushIfHasSomeEvents(): Promise<void> {
    if (this._events.length <= 0) {
      return Promise.resolve();
    }
    return this._flush();
  }

  _flushIfEnough(): Promise<void> {
    if (this._events.length < DEFAULT_FLUSH_LIMIT) {
      return Promise.resolve();
    }
    return this._flush();
  }

  _flush(): Promise<void> {
    const events = this._events.slice(0, DEFAULT_UPLOAD_LIMIT);
    if (events.length <= 0) {
      return Promise.resolve();
    }
    const serializedFormat = this._serializeEvents(events);
    const value = JSON.stringify(serializedFormat);
    return fetch(this._endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: value,
      mode: 'cors',
    }).then(
      () => {
        this._events = this._events.slice(events.length);
        return this._persist();
      },
      error => {
        return Promise.reject(error);
      }
    );
  }

  _addAndDrop(event: Event): Promise<void> {
    this._events.push(event);
    return this._dropIfNeeded();
  }

  _doWrite(event: Event): Promise<void> {
    return this._addAndDrop(event)
      .then(() => this._persist())
      .then(() => this._flushIfEnough());
  }

  write(event: Event): void {
    this._executor.submit(() => {
      return this._doWrite(event);
    });
  }
}

export class SkygearEventTracker {
  _container: SkygearContainer;
  _writer: Writer;

  constructor(container: SkygearContainer) {
    this._container = container;
    const endpoint =
      this._container.endPoint.replace(/\/$/, '') + DEFAULT_MOUNT_PATH;
    this._writer = new Writer(new WindowLocalStorage(), endpoint);
  }

  _generateEnvironmentContext(): EnvironmentContext {
    return {
      _page_path: getPagePathname(),
      _page_search: getPageSearch(),
      _page_url: getPageURL(),
      _page_referrer: getPageReferrer(),
      _utm_campaign: getUTMCampaign(),
      _utm_channel: getUTMChannel(),
      _user_agent: getUserAgent(),
    };
  }

  _sanitizeUserDefinedAttributes(
    attributes: ?UserDefinedAttributes
  ): UserDefinedAttributes {
    if (!attributes) {
      return {};
    }
    const output = {};
    const keys = Object.keys(attributes);
    for (const key of keys) {
      const value = attributes[key];
      if (typeof value === 'boolean') {
        output[key] = value;
      } else if (typeof value === 'number') {
        output[key] = value;
      } else if (typeof value === 'string') {
        output[key] = value;
      }
    }
    return output;
  }

  track(eventName: string, attributes?: UserDefinedAttributes) {
    if (!eventName) {
      return;
    }
    const sanitizedAttributes = this._sanitizeUserDefinedAttributes(attributes);
    const environmentContext = this._generateEnvironmentContext();
    const baseEvent: BaseEvent = {
      _tracked_at: new Date(),
      _event_raw: eventName,
      _user_id: this._container.currentUser && this._container.currentUser.id,
    };
    const event: Event = objectAssign(
      {},
      sanitizedAttributes,
      environmentContext,
      baseEvent
    );
    this._writer.write(event);
  }
}
