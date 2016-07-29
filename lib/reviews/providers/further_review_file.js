import yaml from 'js-yaml';

import GithubFileProvider from '../github_file_provider';
import parseLogin from '../../parse_login';

class FurtherReviewFileProvider extends GithubFileProvider {
  getFilePaths() {
    return (this.config.file || '.further-review.yml,.further-review.yaml').split(',');
  }

  getReviewsFromFile(owner, repo, sha, contents) {
    const data = yaml.safeLoad(contents, {
      json: true,
    });

    this.log.debug(data);

    if (data && data.reviews && Array.isArray(data.reviews)) {
      data.reviews
        .forEach(r => {
          r.logins = r.logins.map(parseLogin);
        });

      return data.reviews;
    }

    return [];
  }
}

export {
  FurtherReviewFileProvider as default,
};
