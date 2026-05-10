import { Form, Input, InputNumber, Typography } from "antd";
import { Create, useForm } from "@refinedev/antd";
import gql from "graphql-tag";

type CreateItemValues = {
  name: string;
  description?: string | null;
  price: number;
};

const ITEM_CREATE_MUTATION = gql`
  mutation ItemCreate($input: CreateOneItemInput!) {
    createOneItem(input: $input) {
      id
      name
      description
      price
    }
  }
`;

export const ItemsCreate = () => {
  const { formProps, saveButtonProps } = useForm<CreateItemValues>({
    resource: "items",
    action: "create",
    redirect: "edit",
    meta: { gqlMutation: ITEM_CREATE_MUTATION },
  });

  return (
    <Create saveButtonProps={saveButtonProps}>
      <Form {...formProps} layout="vertical">
        <Form.Item label="Name" name="name" rules={[{ required: true }]}>
          <Input />
        </Form.Item>
        <Form.Item label="Description" name="description">
          <Input.TextArea rows={3} />
        </Form.Item>
        <Form.Item label="Price" name="price" rules={[{ required: true }]}>
          <InputNumber min={0} step={0.01} style={{ width: "100%" }} />
        </Form.Item>
        <Typography.Text type="secondary">
          Save the item first, then attach files from the edit page.
        </Typography.Text>
      </Form>
    </Create>
  );
};
