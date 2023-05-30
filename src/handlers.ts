import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { S3 } from "aws-sdk";
import { json } from "stream/consumers";
import { v4 } from "uuid";

const s3 = new S3();
const bucketName = "example-serverless-bucket";

class HTTPError extends Error {
  readonly statusCode: number;
  constructor(message: string, statusCode: number) {
    super(message);
    this.statusCode = statusCode;
  }
}

const getUUID = (event: APIGatewayProxyEvent) => {
  const uuid = event.pathParameters!["uuid"];

  if (!uuid) {
    throw new HTTPError("Missing UUID", 400);
  }

  return uuid;
};

const getErrorResult = (e: Error): APIGatewayProxyResult => {
  if (e instanceof HTTPError) {
    return {
      statusCode: e.statusCode,
      body: JSON.stringify({ error: e.message }),
    };
  }
  return {
    statusCode: 500,
    body: JSON.stringify({ error: e.message }),
  };
};

const validateUserExists = async (uuid: string): Promise<void> => {
  try {
    await s3
      .headObject({
        Bucket: bucketName,
        Key: `${uuid}.json`,
      })
      .promise();
  } catch (error: any) {
    if (error.code === "NotFound" || error.code === "NoSuchKey") {
      throw new HTTPError("user not found", 404);
    }
    throw error;
  }
};
interface User extends Object {
  uuid: String;
}

const upsertUser = async (uuid: string, body: string | null): Promise<User> => {
  const user = { ...JSON.parse(body || "{}"), uuid };
  await s3
    .putObject({
      Bucket: bucketName,
      Key: `${uuid}.json`,
      Body: JSON.stringify(user),
    })
    .promise();

  return user;
};

export const getUser = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const uuid = getUUID(event);
    await validateUserExists(uuid);

    const output = await s3
      .getObject({
        Bucket: bucketName,
        Key: `${uuid}.json`,
      })
      .promise();

    return {
      statusCode: 200,
      body: output.Body?.toString() || "",
    };
  } catch (error: any) {
    if (error.code === "NotFound" || error.code === "NoSuchKey") {
      return {
        statusCode: 404,
        body: JSON.stringify({ error: "User not found" }),
      };
    }

    return getErrorResult(error);
  }
};

export const postUser = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const uuid = v4();

  try {
    return {
      statusCode: 201,
      body: JSON.stringify(await upsertUser(uuid, event.body)),
    };
  } catch (error: any) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message }),
    };
  }
};

export const putUser = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const uuid = getUUID(event);
    await validateUserExists(uuid);
    const user = await upsertUser(uuid, event.body);
    return {
      statusCode: 200,
      body: JSON.stringify(user),
    };
  } catch (error: any) {
    return getErrorResult(error);
  }
};
