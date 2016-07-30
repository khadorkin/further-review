import test from 'ava';
import Promise from 'bluebird';
import sinon from 'sinon';

import Provider from './providers/provider';
import { createTestLog, createTestConfig } from './test_helpers';
import {
  default as Reviewer,
  getMentions,
  getSignOffs,
  isGlobMatch,
} from './reviewer';

const SelfLogin = 'further-review';

test.beforeEach(t => {
  t.context.pr = {
    owner: 'paultyng',
    repo: 'further-review',
    sha: 'abcd1234',
    number: 32,
  };

  t.context.github = {
    createStatus: sinon.stub().returns(Promise.resolve()),
    getCurrentUser: sinon.stub().returns(Promise.resolve({ login: SelfLogin })),
    getIssueComments: sinon.stub().returns(
      Promise.resolve([
        { body_text: 'wut?', user: { login: 'visitor1' } },
        { body_text: 'LGTM', user: { login: 'signoff1' } },
      ])
    ),
    getPullRequestFiles: sinon.stub().returns(
      Promise.resolve([
        { filename: 'file1.js' },
        { filename: 'file2.js' },
      ])
    ),
    createComment: sinon.stub().returns(Promise.resolve()),
  };
});

test('isGlobMatch - matches file set', t => {
  const files = ['package.json'];
  const glob = 'package.json';

  t.true(isGlobMatch(files, glob));
});

test('isGlobMatch - does not match file set', t => {
  const files = ['Dockerfile'];
  const glob = 'package.json';

  t.false(isGlobMatch(files, glob));
});

test('isGlobMatch - complex match', t => {
  const files = ['Dockerfile', 'schema/deploy.yaml', 'index.js'];
  const glob = '{package.json,schema/**/*.{yaml,yml}}';

  t.true(isGlobMatch(files, glob));
});

function stubParamsGitHubComments(comments) {
  return {
    github: {
      getCurrentUser: () => Promise.resolve({ login: SelfLogin }),
      getIssueComments: () => Promise.resolve(comments),
    },
    owner: 'paultyng',
    repo: 'further-review',
    login: SelfLogin,
  };
}

test('getMentions', t => {
  return getMentions(stubParamsGitHubComments([
    '@BeGinning @middle @END',
    '@twice',
    '@twice',
    '\n@Chars-1-2-3\n@newlines\n',
  ].map(body => ({ user: { login: SelfLogin }, body_text: body }))))
  .then(mentions => {
    t.deepEqual(mentions, [
      'beginning',
      'chars-1-2-3',
      'end',
      'middle',
      'newlines',
      'twice',
    ]);
  });
});

test('getSignOffs', t => {
  return getSignOffs(stubParamsGitHubComments([
    { user: { login: 'paultyngno' }, body_text: 'just a comment' },
    { user: { login: SelfLogin }, body_text: 'LGTM' },
    { user: { login: 'paultyngyes' }, body_text: 'Yeah, this LGTM' },
  ]))
  .then(signOffs => t.deepEqual(signOffs, ['paultyngyes']));
});

test('Reviewer.updateStatus', t => {
  const r = new Reviewer({
    github: t.context.github,
  });

  const { owner, repo, sha } = t.context.pr;

  const statusParams = {
    owner, repo, sha,
    state: 'pending',
    description: 'Test Description',
  };

  return r.updateStatus(statusParams)
    .then(() => {
      t.true(t.context.github.createStatus.calledOnce);

      const call = t.context.github.createStatus.getCall(0);

      t.deepEqual(call.args[0], Object.assign({}, statusParams, {
        context: 'Further Review',
        targetUrl: null,
      }));
    });
});

test('Reviewer.processReviews - simple success', t => {
  class TestProvider extends Provider {
    getReviews() {
      return [{
        name: 'Test Review',
        logins: ['signoff1'],
      }];
    }
  }

  const providers = { test_provider: TestProvider };
  const config = createTestConfig({
    review: {
      test_provider: true,
    },
  });

  const r = new Reviewer({
    config,
    github: t.context.github,
    providers,
    log: createTestLog(),
  });

  return r.processReviews(t.context.pr)
    .tap(() => {
      t.true(t.context.github.createStatus.calledTwice);
      t.deepEqual(
        t.context.github.createStatus.args.map(([{ state }]) => state),
        ['pending', 'success']
      );
    });
});

test('Reviewer.processReviews - mentions', t => {
  class TestProvider extends Provider {
    getReviews() {
      return [{
        name: 'Test Review',
        logins: ['mention1', 'mention2'],
      }];
    }
  }

  const providers = { test_provider: TestProvider };
  const config = createTestConfig({
    review: {
      test_provider: true,
    },
  });

  const r = new Reviewer({
    config,
    github: t.context.github,
    providers,
    log: createTestLog(),
  });

  return r.processReviews(t.context.pr)
    .tap(() => {
      t.true(t.context.github.createStatus.calledTwice);
      t.deepEqual(
        t.context.github.createStatus.args.map(([{ state }]) => state),
        ['pending', 'failure']
      );
      t.true(t.context.github.createComment.calledOnce);
      // TODO: test comment data...
    });
});
