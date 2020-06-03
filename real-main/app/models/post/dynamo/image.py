import logging

logger = logging.getLogger()


class PostImageDynamo:
    def __init__(self, dynamo_client):
        self.client = dynamo_client

    def pk(self, post_id):
        return {
            'partitionKey': f'post/{post_id}',
            'sortKey': 'image',
        }

    def get(self, post_id, strongly_consistent=False):
        return self.client.get_item(self.pk(post_id), ConsistentRead=strongly_consistent)

    def delete(self, post_id):
        return self.client.delete_item(self.pk(post_id))

    def transact_add(self, post_id, crop=None, image_format=None, original_format=None, taken_in_real=None):
        item = {
            'schemaVersion': {'N': '0'},
            'partitionKey': {'S': f'post/{post_id}'},
            'sortKey': {'S': 'image'},
        }
        if crop is not None:
            item['crop'] = {
                'M': {
                    pt: {'M': {coord: {'N': str(crop[pt][coord])} for coord in ('x', 'y')}}
                    for pt in ('upperLeft', 'lowerRight')
                }
            }
        if image_format is not None:
            item['imageFormat'] = {'S': image_format}
        if original_format is not None:
            item['originalFormat'] = {'S': original_format}
        if taken_in_real is not None:
            item['takenInReal'] = {'BOOL': taken_in_real}
        return {
            'Put': {
                'Item': item,
                'ConditionExpression': 'attribute_not_exists(partitionKey)',  # no updates, just adds
            }
        }

    def set_height_and_width(self, post_id, height, width):
        query_kwargs = {
            'Key': self.pk(post_id),
            'UpdateExpression': 'SET height = :height, width = :width',
            'ExpressionAttributeValues': {':height': height, ':width': width},
        }
        return self.client.update_item(query_kwargs)

    def set_colors(self, post_id, color_tuples):
        assert color_tuples, 'No support for deleting colors, yet'

        # transform to map before saving
        color_maps = [{'r': ct[0], 'g': ct[1], 'b': ct[2]} for ct in color_tuples]

        query_kwargs = {
            'Key': self.pk(post_id),
            'UpdateExpression': 'SET colors = :colors',
            'ExpressionAttributeValues': {':colors': color_maps},
        }
        return self.client.update_item(query_kwargs)
