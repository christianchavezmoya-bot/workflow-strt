using Microsoft.OpenApi.Models;
using Swashbuckle.AspNetCore.SwaggerGen;

namespace Commtrac.Api.Swagger;

public class FileUploadOperationFilter : IOperationFilter
{
    public void Apply(OpenApiOperation operation, OperationFilterContext context)
    {
        var hasFormFile = context.ApiDescription.ParameterDescriptions
            .Any(param => param.Type == typeof(IFormFile));

        if (!hasFormFile)
        {
            return;
        }

        operation.RequestBody = new OpenApiRequestBody
        {
            Content =
            {
                ["multipart/form-data"] = new OpenApiMediaType
                {
                    Schema = new OpenApiSchema
                    {
                        Type = "object",
                        Properties = new Dictionary<string, OpenApiSchema>
                        {
                            ["file"] = new OpenApiSchema { Type = "string", Format = "binary" },
                            ["type"] = new OpenApiSchema { Type = "string" },
                            ["linkedTo"] = new OpenApiSchema { Type = "string" }
                        },
                        Required = new HashSet<string> { "file" }
                    }
                }
            }
        };
    }
}
